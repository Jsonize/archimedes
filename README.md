# Archimedes

Archimedes is an abstract distributed job engine on AWS.

## SDK use

### Import SDK

```js
const Archimedes = require("archimedes")("<NAME_OF_LAMBDA_FUNCTION>");
```

### Create job

```js
Archimedes.create({
    jobType: "<JOB_TYPE>",
    inputData: {
        //<all json-like input data the job needs to know>
    },
    inputFiles: {
        //<all file-like input data like urls to s3 the job needs to know>
    },
    estimations: {
        //<all job meta metrics the system needs to know in order to triage job execution>
    }
}).then(job => {
    console.log(job);
}).catch(err => {
    console.log(err);
});
```

### Run job

```js
Archimedes.signal({
    jobId: job.id,
    state: "DISPATCH"
}).then().catch();    
```

### Handle job

Payload for job execution will be:

```json
{
  "id": "<JOB_ID>"
}
```

Then use Archimedes to get all job data including `inputData` and `inputFiles`:

```js
let job = await Archimedes.get({
    jobId: "<JOB_ID>"
});
```

Then signal that we are executing this:

```js
job = Archimedes.signal({
    jobId: job.id,
    state: "EXECUTE"
})
```

This will in particular now add a `currentExecution` object to the job object:

```js
    let jobExecution = job.currentExecution; /* {
        executionId: 'XXX',
        createdAt: 'YYY',
        updatedAt: 'ZZZ',
        metrics: {},
        progress: 0,
        state: 'EXECUTE',
        failureReason: '',
        finishedAt: null
    } */
```

While you're executing you might want to periodically upgrade metrics (e.g. max cpu load, max memory usage etc.) as well
as progress. This can be of use two-fold:
- your own application might query this data to show job progress to the user
- Archimedes is scanning jobs in the background for non-progression to make sure to kill and reschedule stuck jobs

To update progress and/or metrics:

```js
    Archimedes.updateExecution({
        jobId: "XXX",
        executionId: jobExecution.executionId,
        progress: 0.5,
        metrics: {
            cpu: 1234,
            memory: 5678
        }
    })
```

Once you're done with the job, you can store your `outputData` and `outputFiles` like so:

```js
    Archimedes.update({
        jobId: "XXX",
        outputData: {
            ...
        },
        outputFiles: {
            ...
        }
    })
```

And you transition the job to success or failure like so:

```js
    Archimedes.signalExecution({
        jobId: "XXX",
        executionId: jobExecution.executionId,
        state: "SUCCESS" // "FAILURE"
     // failureReason: "XXXX" 
    })
```
