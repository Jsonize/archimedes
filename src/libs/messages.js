const AWS = require('aws-sdk');
const SNS = new AWS.SNS({apiVersion: '2010-03-31'});

module.exports = function (topic) {
    return {

        notify: function (jobId, state) {
            return SNS.publish({
                TopicArn: topic,
                Message: JSON.stringify({
                    jobId: jobId,
                    state: state
                })
            }).promise();
        }

    };
};