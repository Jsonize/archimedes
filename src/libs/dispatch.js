const AWS = require('aws-sdk');
const SNS = new AWS.SNS({apiVersion: '2010-03-31'});

module.exports = function (topic) {
    return {

        dispatchJob: function (job) {
            console.log("Dispatch", job);
            return SNS.publish({
                TopicArn: topic,
                Message: JSON.stringify({
                    type: job.jobType,
                    id: job.jobId,
                    estimations: job.estimations,
                    handler: job.failureCount > 0 ? job.fallbackHandler : null
                })
            }).promise();
        }

    };
};