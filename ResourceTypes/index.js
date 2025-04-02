addResourceType(require("./S3Bucket.js"));
addResourceType(require("./DynamoDBTable.js"));
addResourceType(require("./LogsLogGroup.js"));

function addResourceType(type){
    exports[type.TYPE] = new type();
}