'use strict';

/* eslint no-unused-expressions: 0 */

const expect = require('chai').expect;
// const sinon = require('sinon');

const Promise = require('bluebird');
const { BadRequest } = require('@feathersjs/errors');
const couchbase = require('couchbase-promises').Mock;
const { CouchService, QueryConsistency } = require('../lib');
const R = require('ramda');

describe('Couchbase Adapter (find)', function () {
  const bucketName = 'testbucket';
  const Cluster = new couchbase.Cluster(`couchbase://localhost`);
  const Bucket = Cluster.openBucket(bucketName, bucketName);

  const responseQueue = [];
  Bucket.queryAsync = () => new Promise((resolve, reject) => {
    if (responseQueue.length > 0) { return void resolve(responseQueue.pop()); }

    reject(new Error('TEST-ERROR :: No data in queue'));
  });

  function addData (data) {
    responseQueue.push(data);
  }

  /**
   * @type {CouchService | null}
   */
  let Service = null;

  beforeEach(() => {
    responseQueue.length = 0;
    Service = new CouchService({
      couchbase: couchbase,
      bucket: 'testbucket',
      connection: Bucket,
      name: 'users',
      id: 'uuid'
    });
  });

  it('Should find element', () => {
    const obj = {
      foo: 'bar'
    };
    addData([obj]);

    return Service.find({
      query: {
        foo: 'bar'
      }
    })
      .then((res) => {
        expect(res).to.be.ok;
      });
  });

  it('Should error when no params are passed', () => {
    return Service.find()
      .then(() => { throw new Error('Should not happen'); })
      .catch((err) => {
        expect(err).to.be.instanceOf(BadRequest);
      });
  });

  it('Should error when no query is passed', () => {
    return Service.find({})
      .then(() => { throw new Error('Should not happen'); })
      .catch((err) => {
        expect(err).to.be.instanceOf(BadRequest);
      });
  });

  it('Should paginate', () => {
    Service = new CouchService({
      couchbase: couchbase,
      bucket: 'testbucket',
      connection: Bucket,
      name: 'users',
      id: 'uuid',
      paginate: {
        'default': 10,
        'max': 50
      }
    });

    const results = [{ foo: 'bar' }];
    addData([ results, { metrics: { resultCount: results.length } } ]);

    return Service.find({
      query: {
        foo: 'bar',
        $limit: 10
      }
    })
      .then((res) => {
        expect(res).to.be.ok;
      });
  });

  it('Should return only selected keys', () => {
    const result = { foo: 'bar', bar: 'foo' };
    const results = R.map(() => result)(Array(10));
    addData([ results, { metrics: { resultCount: results.length } } ]);

    return Service.find({
      query: {
        $select: [ 'foo' ],
        foo: 'bar'
      }
    })
      .then((res) => {
        expect(res).to.be.ok;
        expect(res).to.have.length(results.length);
        expect(res[0]).to.deep.equal({ foo: result.foo });
      });
  });

  it('Should allow to specify consistency NONE', () => {
    const obj = {
      foo: 'bar'
    };
    addData([obj]);

    return Service.find({
      query: {
        foo: 'bar',
        $consistency: QueryConsistency.NOT_BOUNDED
      }
    })
      .then((res) => {
        expect(res).to.be.ok;
      });
  });

  it('Should allow to specify consistency LOCAL', () => {
    const obj = {
      foo: 'bar'
    };
    addData([obj]);

    return Service.find({
      query: {
        foo: 'bar',
        $consistency: QueryConsistency.REQUEST_PLUS
      }
    })
      .then((res) => {
        expect(res).to.be.ok;
      });
  });

  it('Should allow to specify consistency GLOBAL', () => {
    const obj = {
      foo: 'bar'
    };
    addData([obj]);

    return Service.find({
      query: {
        foo: 'bar',
        $consistency: QueryConsistency.STATEMENT_PLUS
      }
    })
      .then((res) => {
        expect(res).to.be.ok;
      });
  });
});
