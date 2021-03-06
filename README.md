# feathersjs-couchbase

[![Build Status](https://travis-ci.org/Sieabah/feathersjs-couchbase.svg?branch=master)](https://travis-ci.org/Sieabah/feathersjs-couchbase)
[![Maintainability](https://api.codeclimate.com/v1/badges/ac6cb7962df1a5a5958a/maintainability)](https://codeclimate.com/github/Sieabah/feathersjs-couchbase/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/ac6cb7962df1a5a5958a/test_coverage)](https://codeclimate.com/github/Sieabah/feathersjs-couchbase/test_coverage)
[![Dependencies Status](https://david-dm.org/sieabah/feathersjs-couchbase/status.svg)](https://david-dm.org/sieabah/feathersjs-couchbase)
[![Download Status](https://img.shields.io/npm/dt/feathersjs-couchbase.svg?style=flat-square)](https://www.npmjs.com/package/feathersjs-couchbase)

> FeathersJS DB adapter for couchbase

## Installation

```
npm install feathersjs-couchbase --save
```

### Warning about N1QL Injections

This library only sanitizes *values* and *does not* sanitize any keys. It is a plan to build into the query builder
a sanitization layer but for now it's open to attacks. This can be easily mitigated by validating your input and 
excluding any keys not expected from your input.

```
{
  "; SELECT * FROM `admin`; /*": "*/"
}
``` 

## Documentation

```
const couchbase = require('couchbase-promises')
const cluster = new couchbase.Cluster('couchbase://127.0.0.1')
const bucketName = 'default';
const bucket = cluster.openBucket(bucketName)

const config = {
  name: 'users', // Name of service and key prefix (REQUIRED)
  bucket: bucketName, // Couchbase bucket name (REQUIRED)
  connection: bucket, // Bucket connection, or promise that resolves to connection (REQUIRED)
  
  separator: '::' // optional key separator (defaults to `::`)
  couchbase: couchbase, // optional couchbase dependency (OPTIONAL)
  id: 'id', // ID field to use (OPTIONAL) (defaults to `uuid`)
  paginate: app.get('paginate'), // (OPTIONAL)
};

// Initialize our service with all options it requires
app.use(`/${options.name}`, new Service(options));
 
const createService = require('feathersjs-couchbase')
  
// Method 1
app.use('/',createService(config));
 
// Method 2
const { CouchService } = require('feathersjs-couchbase');
new CouchService(config)
```

### Recommended Service Creation

```
'use strict';

const { CouchService } = require('feathersjs-couchbase');

class Users extends CouchService {
  constructor(opts){
    super(opts);
  }

  create(data, params){
    return super.create(
      Object.assign({ // Your default data here
        auth0Id: null,
        role: 'default',
      }, data) // Data passed in
    , params);
  }
}

module.exports = Rooms;
```

### API

The library implements the full [feathersjs common api](https://docs.feathersjs.com/api/databases/common.html) and 
[Query api](https://docs.feathersjs.com/api/databases/querying.html), see limitations for exceptions.

> **Finds will not work until an index is built over the bucket you're trying to query**

#### Additional API

##### $consistency (_only_ valid on Service.find)
N1QL Consistency special parameter. [Consistency Documentation](https://developer.couchbase.com/documentation/server/current/architecture/querying-data-with-n1ql.html)

```
const { QueryConsistency } = require('feathersjs-couchbase');

Service.find({
  $consistency: QueryConsistency.NOT_BOUNDED
  ... 
});
```
Consistency Levels:
- NOT_BOUNDED
- REQUEST_PLUS
- STATEMENT_PLUS

Omitting $consistency results in the default consistency of 'at_plus';

## Limitations

- Subqueries are not supported
- Only tested with feathers v3
- $selects on Service.find calls pulls all data and removes sections locally

## License

Copyright (c) 2018

Licensed under the [MIT license](LICENSE).
