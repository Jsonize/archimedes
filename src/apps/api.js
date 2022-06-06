const Service = require(__dirname + "/libs/service.js");

module.exports = {

    create: Service.createJob,
    get: Service.getJob,
    update: Service.updateJob,
    delete: Service.deleteJob,
    find: Service.findJobs,
    signal: Service.signalJob,
    updateExecution: Service.updateJobExecution,
    signalExecution: Service.signalJobExecution

};

exports.handler = async function (event, context, callback) {
    try {
        let result = await module.exports[event.action].apply(module.exports, event.params);
        callback(null, result);
    } catch (e) {
        callback(e);
    }
};
