const Service = require(__dirname + "/libs/service.js");

const Functions = {

    create: Service.createJob,
    get: Service.getJob,
    update: Service.updateJob,
    delete: Service.deleteJob,
    find: Service.findJobs,
    signal: Service.signalJob,
    updateExecution: Service.updateJobExecution,
    signalExecution: Service.signalJobExecution

};

if (process.env.LAMBDA_TASK_ROOT) {
    exports.handler = async function (event, context, callback) {
        try {
            let result = await Functions[event.action].call(Functions, event.params);
            callback(null, result);
        } catch (e) {
            callback(e);
        }
    };
} else {
    module.exports = Functions;
}