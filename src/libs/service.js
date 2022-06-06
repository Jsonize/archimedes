const DB = require(__dirname + "/db.js")({
    tableName: process.env.DYNAMODB_TABLE,
    partitionKey: "jobId",
    globalIndexes: {
        "jobType:jobId": {
            partitionKey: "jobType",
            rangeKey: "jobId"
        },
        "jobType+State:jobId": {
            partitionKey: "jobTypeState",
            rangeKey: "jobId"
        },
        "state:transitionAt+jobId": {
            partitionKey: "state",
            rangeKey: "transitionAtJobId"
        }
    },
    compoundKeys: {
        jobTypeState: ["jobType", "state"],
        transitionAtJobId: ["transitionAt", "jobId"]
    }
});

const Messages = require(__dirname + "/messages.js")(process.env.SNS_MESSAGE_TOPIC);

const Dispatch = require(__dirname + "/dispatch.js")(process.env.SNS_DISPATCH_TOPIC);

const Crypto = require('crypto');

const JOB_STATES = {
    OPEN: "OPEN",
    DISPATCH: "DISPATCH",
    RESCHEDULE: "RESCHEDULE",
    EXECUTE: "EXECUTE",
    DISCARD: "DISCARD",
    SUCCESS: "SUCCESS",
    FAILURE: "FAILURE",
    TIMEOUT: "TIMEOUT",
    NOTREADY: "NOTREADY"
};

const JOB_EXECUTION_STATES = {
    EXECUTE: "EXECUTE",
    DISCARD: "DISCARD",
    SUCCESS: "SUCCESS",
    FAILURE: "FAILURE",
    TIMEOUT: "TIMEOUT",
    NOTREADY: "NOTREADY"
};

const DEFAULTS = {
    discardTimeout: parseInt(process.env.DISCARD_TIMEOUT, 60),
    dispatchTimeout: parseInt(process.env.DISPATCH_TIMEOUT, 60),
    executeTimeout: parseInt(process.env.EXECUTE_TIMEOUT, 60 * 60 * 24 * 7),
    noprogressTimeout: parseInt(process.env.NOPROGRESS_TIMEOUT, 60 * 60 * 24),
    rescheduleCooldown: parseInt(process.env.RESCHEDULE_COOLDOWN, 15),
    maxFailureCount: parseInt(process.env.MAX_FAILURE_COUNT, -1),
    maxNotReadyCount: parseInt(process.env.MAX_NOT_READY_COUNT, -1),
    maxTimeoutCount: parseInt(process.env.MAX_TIMEOUT_COUNT, -1),
}

const ERRORS = {
    STATE_TRANSITION: function (source, target) {
        return `Cannot transition from ${source} to ${target}.`;
    },
    UNKNOWN_EXECUTION_ID: function (jobId, executionId) {
        return `Unkown job ${jobId} execution id ${executionId}.`;
    },
};

function updateState(job, params, transitionAtTimeout) {
    const dt = new Date();
    job.state = params.state;
    job.updatedAt = dt.toISOString();
    let update = {
        state: job.state,
        updatedAt: job.updatedAt
    };
    if (transitionAtTimeout) {
        job.transitionAt = transitionAtBy(dt, transitionAtTimeout);
        update.transitionAt = job.transitionAt;
    }
    return DB.update({jobId: params.jobId}, update).then(_ => Messages.notify(params.jobId, params.state).then(_ => job));
}

function updateExecutionState(job, params, state, updates) {
    let doc = {};
    const d = new Date();
    const dt = d.toISOString();
    if (state !== undefined) {
        doc.state = state;
        doc.updatedAt = dt;
        if (state === JOB_STATES.RESCHEDULE)
            doc.transitionAt = transitionAtBy(d, job.rescheduleCooldown);
    }
    if (updates !== undefined)
        for (let key in updates)
            doc[key] = updates[key];
    let jobExecution = job.currentExecution;
    if (!job.currentExecution || params.executionId !== job.currentExecution.executionId)
        jobExecution = job.pastExecutions.find(execution => execution.executionId === params.executionId);
    doc.currentExecution = job.currentExecution;
    doc.pastExecutions = job.pastExecutions;
    jobExecution.updatedAt = dt;
    jobExecution.state = params.state;
    if (params.state !== JOB_EXECUTION_STATES.EXECUTE)
        jobExecution.finishedAt = dt;
    const prom = DB.update({jobId: params.jobId}, doc);
    return state !== undefined ? prom.then(_ => Messages.c.then(_ => job)) : prom.then(_ => job);
}

function transitionAtBy(dt, timeout) {
    return dt.getTime() + timeout * 1000;
}

const Mod = {

    createJob: function (params) {
        const dt = new Date();
        const discardTimeout = params.discardTimeout || DEFAULTS.discardTimeout;
        return DB.insert({
            jobId: Crypto.randomUUID(),
            jobType: params.jobType,
            createdAt: dt.toISOString(),
            updatedAt: dt.toISOString(),
            inputData: params.inputData || {},
            outputData: {},
            inputFiles: params.inputFiles || {},
            outputFiles: {},
            estimations: params.estimations || {},
            currentExecution: null,
            pastExecutions: [],
            state: JOB_STATES.OPEN,
            transitionAt: transitionAtBy(dt, discardTimeout),
            discardTimeout: discardTimeout,
            dispatchTimeout: params.dispatchTimeout || DEFAULTS.dispatchTimeout,
            executeTimeout: params.executeTimeout || DEFAULTS.executeTimeout,
            noprogressTimeout: params.noprogressTimeout || DEFAULTS.noprogressTimeout,
            rescheduleCooldown: params.rescheduleCooldown || DEFAULTS.rescheduleCooldown,
            maxTimeoutCount: params.maxTimeoutCount || DEFAULTS.maxTimeoutCount,
            maxFailureCount: params.maxFailureCount || DEFAULTS.maxFailureCount,
            maxNotReadyCount: params.maxNotReadyCount || DEFAULTS.maxNotReadyCount,
            timeoutCount: 0,
            failureCount: 0,
            notReadyCount: 0,
            fallbackHandler: params.fallbackHandler || ""
        });
    },

    getJob: function (params) {
        return DB.get({jobId: params.jobId});
    },

    updateJob: function (params) {
        return DB.update({jobId: params.jobId}, params);
    },

    deleteJob: function (params) {
        return DB.delete({jobId: params.jobId});
    },

    findJobs: function (params) {
        let index = undefined;
        if (params.filter.jobType && params.filter.state)
            index = "jobType+State:jobId";
        else if (params.filter.jobType)
            index = "jobType:jobId";
        else if (params.filter.state)
            index = "state:transitionAt+jobId";
        return DB.find({
            index: index,
            filter: params.filter,
            skip: params.skip,
            limit: params.limit
        });
    },

    signalJob: function (params) {
        return Mod.getJob(params.jobId).then(job => {
            switch (job.state) {
                case JOB_STATES.OPEN:
                case JOB_STATES.RESCHEDULE: {
                    switch (params.state) {
                        case JOB_STATES.DISPATCH:
                            return updateState(job, params, job.dispatchTimeout).then(job => Dispatch.dispatchJob(job));
                        case JOB_STATES.DISCARD:
                            return updateState(job, params);
                        default:
                            return Promise.reject(ERRORS.STATE_TRANSITION(job.state, params.state));
                    }
                }
                case JOB_STATES.DISPATCH: {
                    switch (params.state) {
                        case JOB_STATES.EXECUTE:
                            let pastExecutions = job.pastExecutions || [];
                            if (job.currentExecution)
                                pastExecutions.push(job.currentExecution);
                            return DB.update({jobId: params.jobId}, {
                                currentExecution: {
                                    executionId: Crypto.randomUUID(),
                                    createdAt: (new Date()).toISOString(),
                                    updatedAt: (new Date()).toISOString(),
                                    metrics: {},
                                    progress: 0.0,
                                    state: JOB_EXECUTION_STATES.EXECUTE,
                                    failureReason: "",
                                    finishedAt: null
                                },
                                pastExecutions: pastExecutions
                            }).then(_ => updateState(job, params, Math.min(job.noprogressTimeout, job.executeTimeout)));
                        case JOB_STATES.DISCARD:
                            return updateState(job, params);
                        default:
                            return Promise.reject(ERRORS.STATE_TRANSITION(job.state, params.state));
                    }
                }
                case JOB_STATES.EXECUTE: {
                    switch (params.state) {
                        case JOB_STATES.DISCARD:
                            let currentExecution = job.currentExecution || {};
                            currentExecution.state = JOF_EXECUTION_STATES.DISCARD;
                            return DB.update({jobId: params.jobId}, {
                                currentExecution: currentExecution
                            }).then(_ => updateState(job, params));
                        default:
                            return Promise.reject(ERRORS.STATE_TRANSITION(job.state, params.state));
                    }
                }
                default:
                    return Promise.reject(ERRORS.STATE_TRANSITION(job.state, params.state));
            }
        });
    },

    updateJobExecution: function (params) {
        const update = function (jobExecution) {
            if (jobExecution.executionId !== params.executionId)
                return jobExecution;
            for (let key in params)
                if (key in jobExecution)
                    jobExecution[key] = params[key];
            return jobExecution;
        };
        return Mod.getJob(params.jobId).then(job => {
            if (params.progress && progress.state === JOB_STATES.EXECUTE) {
                // TODO: this is not really correct because executeTimeout gets pushed back
                job.transitionAt = transitionAtBy((new Date()).getTime(), Math.min( + job.noprogressTimeout, job.executeTimeout));
            }
            job.currentExecution = update(job.currentExecution);
            job.pastExecutions = job.pastExecutions.map(update);
            return Mod.updateJob(params.jobId, {
                transitionAt: job.transitionAt,
                currentExecution: job.currentExecution,
                pastExecutions: job.pastExecutions
            });
        });
    },

    signalJobExecution: function (params) {
        return Mod.getJob(params.jobId).then(job => {
            let jobExecution = job.currentExecution;
            let isCurrentExecution = true;
            if (!jobExecution || jobExecution.executionId != params.executionId) {
                jobExecution = job.pastExecutions.find(jobExecution => jobExecution.executionId === params.executionId)
                isCurrentExecution = false;
            }
            if (!jobExecution)
                return Promise.reject(ERRORS.UNKNOWN_EXECUTION_ID(params.jobId, params.executionId));
            switch (jobExecution.state) {
                case JOB_EXECUTION_STATES.EXECUTE:
                    switch (params.state) {
                        case JOB_EXECUTION_STATES.DISCARD:
                            updateExecutionState(job, params, isCurrentExecution ? JOB_STATES.DISCARD : undefined);
                        case JOB_EXECUTION_STATES.SUCCESS:
                            updateExecutionState(job, params, isCurrentExecution ? JOB_STATES.SUCCESS : undefined);
                        case JOB_EXECUTION_STATES.FAILURE:
                            updateExecutionState(job, params,
                                isCurrentExecution ? (job.failureCount >= job.maxFailureCount && job.maxFailureCount >= 0 ? JOB_STATES.RESCHEDULE : JOB_STATES.FAILURE) : undefined,
                                isCurrentExecution ? {failureCount: job.failureCount + 1} : undefined
                            );
                        case JOB_EXECUTION_STATES.TIMEOUT:
                            updateExecutionState(job, params,
                                isCurrentExecution ? (job.timeoutCount >= job.maxTimeoutCount && job.maxTimeoutCount >= 0 ? JOB_STATES.RESCHEDULE : JOB_STATES.TIMEOUT) : undefined,
                                isCurrentExecution ? {timeoutCount: job.timeoutCount + 1} : undefined
                            );
                        case JOB_EXECUTION_STATES.NOTREADY:
                            updateExecutionState(job, params,
                                isCurrentExecution ? (job.notReadyCount >= job.maxNotReadyCount && job.maxNotReadyCount >= 0 ? JOB_STATES.RESCHEDULE : JOB_STATES.NOTREADY) : undefined,
                                isCurrentExecution ? {notReadyCount: job.notReadyCount + 1} : undefined
                            );
                        default:
                            return Promise.reject(ERRORS.STATE_TRANSITION(jobExecution.state, params.state));}
                default:
                    return Promise.reject(ERRORS.STATE_TRANSITION(jobExecution.state, params.state));
            }
        });
    },

    updateJobs: async function () {
        const iterateJobs = async function (state, callback) {
            const jobs = await DB.find({
                index: "state:transitionAt+jobId",
                filter: {
                    state: state,
                    transitionAt: {"<": (new Date()).getTime()}
                }
            });
            for (let i = 0; i < jobs.length; ++i)
                await callback(jobs[i]);
        };
        await iterateJobs(JOB_STATES.OPEN, job => this.signalJob({jobId: job.jobId, state: JOB_STATES.DISCARD}));
        await iterateJobs(JOB_STATES.RESCHEDULE, job => this.signalJob({jobId: job.jobId, state: JOB_STATES.DISPATCH}));
        await iterateJobs(JOB_STATES.DISPATCH, job => this.signalJob({jobId: job.jobId, state: JOB_STATES.RESCHEDULE}));
        await iterateJobs(JOB_STATES.EXECUTE, job => {
            if (transitionAtBy(new Date(job.currentExecution.updatedAt), job.noprogressTimeout) < now.getTime() ||
                transitionAtBy(new Date(job.currentExecution.createdAt), job.executeTimeout) < now.getTime()) {
                this.signalJobExecution({
                    jobId: job.jobId,
                    executionId: job.currentExecution.executionId,
                    state: JOB_EXECUTION_STATES.TIMEOUT
                });
            }
        });
    }

};

module.exports = Mod;