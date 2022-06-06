const AWS = require('aws-sdk');

function lambdaRequest(functionName, action, params) {
    const lambda = new AWS.Lambda();
    return new Promise(function (resolve, reject) {
        lambda.invoke({
            FunctionName: functionName,
            InvocationType: "RequestResponse",
            LogType: "Tail",
            Payload: JSON.stringify({
                action: action,
                params: params
            })
        }, function (err, data) {
            if (err) {
                reject(err);
                return;
            }
            resolve(JSON.parse(data.Payload));
        });
    });
}


const ACTIONS = [
    "create",
    "get",
    "update",
    "delete",
    "find",
    "signal",
    "updateExecution",
    "signalExecution"
];

module.exports = function (functionName) {
    const Actions = {};
    ACTIONS.forEach(action => {
        Actions[action] = function (params) {
            return lambdaRequest(functionName, action, params);
        };
    })
    return ACTIONS;
};