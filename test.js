const Archimedes = (require(__dirname + "/src/sdk/lambda-sdk.js"))("archimedes-api-api");

/*
Archimedes.create({
    jobType: "transcoder",
    inputData: {},
    inputFiles: {},
    estimations: {
        filesize: 1000
    },
}).then(x => console.log(x)).catch(x => console.log(x));
 */

Archimedes.signal({
    jobId: "a0e4237093a1006b20eee4461a22641b",
    state: "DISPATCH"
}).then(x => console.log(x)).catch(x => console.log(x));