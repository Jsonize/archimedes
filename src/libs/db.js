const AWS = require("aws-sdk");

module.exports = function (params) {
    const DynamoDB = new AWS.DynamoDB({apiVersion: "2012-08-10"});
    const Client = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});

    const extendCompoundData = function (baseData, allData) {
        let result = {};
        for (let key in baseData)
            result[key] = baseData[key];
        if (params.compoundKeys) {
            for (let compoundKey in params.compoundKeys) {
                let compoundValue = params.compoundKeys[compoundKey];
                if (compoundValue.some(v => v in baseData)) {
                    result[compoundKey] = compoundValue.map(v => v in baseData ? baseData[v] : allData[v]).join("-");
                }
            }
        }
        return result;
    };

    const canExtendCompoundData = function (baseData) {
        if (params.compoundKeys) {
            for (let compoundKey in params.compoundKeys) {
                let compoundValue = params.compoundKeys[compoundKey];
                if (compoundValue.some(v => v in baseData) && !compoundValue.every(v => v in baseData))
                    return false;
            }
        }
        return true;
    };

    return {

        insert: function (data) {
            const item = extendCompoundData(data, data);
            return Client.put({
                TableName: params.tableName,
                Item: item
            }).promise().then(_ => item);
        },

        get: function (key) {
            return Client.get({
                TableName: params.tableName,
                Key: key
            }).promise().then(x => x.Item);
        },

        delete: function (key) {
            return Client.delete({
                TableName: params.tableName,
                Key: key
            }).promise();
        },

        update: async function (key, update) {
            if (!canExtendCompoundData(update))
                update = extendCompoundData(update, await this.get(key));
            let au = {};
            for (let k in update) {
                if (k === params.partitionKey)
                    continue;
                au[k] = {
                    "ACTION": "PUT",
                    "Value": update[k]
                };
            }
            return (await Client.update({
                TableName: params.tableName,
                Key: key,
                AttributeUpdates: au,
                ReturnValues: "ALL_NEW"
            }).promise()).Attributes;
        },

        find: function (args) {
            const eans = {};
            const eavs = {};
            const conditions = [];
            const partitionKey = args.index ? params.globalIndexes[args.index].partitionKey : params.partitionKey;
            const partitionKeys = partitionKey in params.compoundKeys ? params.compoundKeys[partitionKey] : [partitionKey];
            const partitionValue = partitionKeys.map(k => args.filter[k]).join("-");
            eans["#p"] = partitionKey;
            eavs[":p"] = partitionValue;
            conditions.push("#p=:p");
            const rangeKey = args.index ? params.globalIndexes[args.index].rangeKey : params.rangeKey;
            if (rangeKey) {
                const rangeKeys = partitionKey in params.compoundKeys ? params.compoundKeys[partitionKey] : [partitionKey];
                eans["#r"] = rangeKey;
                const rangeConds = {};
                rangeKeys.forEach(rk => {
                    let rkf = {};
                    if (params.filter[rk]) {
                        if (typeof params.filter[rk] !== "string") {
                            rkf = params.filter[rk];
                        } else
                            rkf["="] = params.filter[rk];
                    }
                    for (let key in rkf)
                        rangeConds[key] = key in rangeConds ? rangeConds[key] + "-" + rkf[key] : rkf[key];
                });
                let i = 0;
                for (let cond in rangeConds) {
                    eavs[":r" + i] = rangeConds[cond];
                    conditions.push("#r" + modifier + ":r" + i)
                }
            }
            return Client.query({
                //ScanIndexForward: ,
                KeyConditionExpression: conditions.map(function(a) {
                    return a.join(" ");
                }).join(" and "),
                ExpressionAttributeNames: eans,
                ExpressionAttributeValues: eavs,
                IndexName: args.index || undefined,
                Limit: args.limit ? args.limit + (args.skip || 0) : undefined
            }).promise().then(result => {
                let items = result && result.Items ? result.Items : [];
                if (args.skip && args.skip > 0)
                    items = items.slice(args.skip);
                return items;
            })
        }

    };

};