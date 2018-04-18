'use strict';

const Promise = require('bluebird');
const { BadRequest, NotFound } = require('@feathersjs/errors');
const { keyNotFound } = require('couchbase').errors;
const { QueryBuilder, QueryConsistency } = require('../querybuilder');
const uuid = require('uuid/v4');
const R = require('ramda');

class Service {
  /**
   * Couchbase Service
   * @param {object} opts - Couchbase Service options
   * @param {string} opts.bucket - Bucket name (REQUIRED)
   * @param {object|Promise} opts.connection - Couchbase bucket connection or promise which resolves to connection (REQUIRED)
   * @param {string} opts.name - Service name (REQUIRED)
   * @param {object} opts.couchbase - Couchbase package dependency (OPTIONAL)
   * @param {string} opts.separator - Key separator (OPTIONAL)
   * @param {object} opts.paginate - FeathersJS Paginate object (OPTIONAL)
   * @param {string} opts.id - Field to use for unique key (OPTIONAL), DO NOT change this without data migration
   */
  constructor(opts) {
    this.opts = opts || {};

    if (this.opts.couchbase == null) {
      this.opts.couchbase = require('couchbase');
    }

    if (this.opts.bucket == null) { throw new Error('Must pass bucket name'); }

    if (this.opts.connection == null) { throw new Error('Must pass bucket connection'); }

    if (this.opts.name == null) { throw new Error('Name of service must be specified'); }

    this.id = opts.id || 'uuid';
    this.paginate = opts.paginate || {};
    this.separator = opts.separator || '::';
  }

  /**
   * FeathersJS Service Setup
   * @param app
   * @param path
   */
  setup(app, path) {
    this.app = app;
    this.path = path;
  }

  /**
   * Get couchbase connection
   */
  schema() {
    // Promisfy the passed in connection in case it's already active and not awaiting it
    return Promise.resolve(this.opts.connection);
  }

  /**
   * Build key
   * @param key Key to prefix
   * @returns {string}
   * @private
   */
  _key(key = '') {
    return [this.opts.name || '', key].join(this.separator);
  }

  /**
   * Get id if one is passed in, otherwise provide one
   * @param data
   * @returns {string}
   * @private
   */
  _id(data) {
    if (!(this.id in data)) { data[this.id] = uuid(); }
    return data[this.id];
  }

  /**
   * Strip keys from Service.find response query
   * @param selected Selected keys
   * @param results Result set
   * @return {Array}
   * @private
   */
  _stripKeys(selected, results) {
    return results.map(a => {
      const result = {};
      for (let key in a) {
        if (a.hasOwnProperty(key) && ~selected.indexOf(key)) { result[key] = a[key]; }
      }
      return result;
    });
  }

  /**
   * Build N1QL Query
   * @param couchbase {object} Couchbase dependency
   * @param str {string} Query String
   * @param consistency {Number} N1QL Consistency
   * @param readonly {boolean} N1QL readonly
   * @private
   */
  _buildN1QL(couchbase, str, consistency, readonly = false) {
    const $query = couchbase.N1qlQuery.fromString(str);

    if (consistency === QueryConsistency.NOT_BOUNDED) {
      $query.consistency(couchbase.N1qlQuery.Consistency.NOT_BOUNDED);
    } else if (consistency === QueryConsistency.REQUEST_PLUS) {
      $query.consistency(couchbase.N1qlQuery.Consistency.REQUEST_PLUS);
    } else if (consistency === QueryConsistency.STATEMENT_PLUS) {
      $query.consistency(couchbase.N1qlQuery.Consistency.STATEMENT_PLUS);
    }

    // Find queries shouldn't ever mutate...
    $query.readonly(readonly);

    return $query;
  }

  _find(query, paginate, consistency = null) {
    return new Promise((resolve, reject) => {
      const { couchbase } = this.opts;
      const QB = (new QueryBuilder(this.opts.bucket));
      const { query: queryStr, values } = QB.interpret(query);

      let selected = [];
      if (query.$select) {
        for (let select of query.$select) { selected.push(select); }
        delete query.$select;
      }

      console.log(queryStr);

      this.schema()
        .then(bucket => bucket
          .query(this._buildN1QL(couchbase, queryStr, consistency, true), values, (err, results, queryData) => {

            console.log(err);
            console.log(results);
            console.log(queryData);

            if (selected.length > 0) {
              results = this._stripKeys(selected, results);
            }

            if (!paginate.default) { resolve(results); }

            resolve({
              total: queryData.metrics.resultCount,
              limit: query.$limit,
              skip: query.$skip != null ? query.$skip : 0,
              data: results
            });
          }));
    });
  }

  /**
   * FeathersJS Service Find
   * @param params
   * @returns {bluebird}
   */
  find(params) {
    return new Promise((resolve, reject) => {
      if (params == null) {
        reject(new BadRequest('Null passed to find'));
      }

      const { query } = params;
      const paginate = (params && typeof params.paginate !== 'undefined') ? params.paginate : this.paginate;

      if (query == null) {
        reject(new BadRequest('Null query object passed'));
      }

      query._type = this.opts.name;
      if (paginate.default) {
        if (query.$limit == null) { query.$limit = paginate.default; }
        query.$limit = R.clamp(0, paginate.max)(query.$limit);
      }

      let consistency = query.$consistency;
      if ('$consistency' in query) { delete query.$consistency; }

      this._find(query, paginate, consistency).then((r) = {
        resolve(r);
      });
    });
  }

  /**
   * FeathersJS Service Get
   * @param id
   * @param params
   * @returns {Promise}
   */
  get(id, params) {
    return new Promise((resolve, reject) => {
      this.schema()
        .then(bucket => bucket
          .get(this._key(id), (err, element) => {
            if (err) {
              if (err.code === keyNotFound) {
                reject(new NotFound('Does not exist'));
              }
              reject(err);
            } else {
              if (element == null) reject(new NotFound('Does not exist'));
              resolve(element.value || element);
            }
          })
        );
    });
  }

  /**
   * FeathersJS Service Create
   * @param data
   * @param params
   * @returns {bluebird}
   */
  create(data, params) {
    return new Promise((resolve, reject) => {
      if (data == null) {
        reject(new BadRequest('No data passed to create'));
      }

      data._type = this.opts.name;
      this.schema()
        .then(bucket => bucket
          .insert(this._key(this._id(data)), data, (err, result) => {
            resolve(this.get(this._id(data), params))
          })
        );
    });
  }

  /**
   * FeathersJS Service Update
   * @param id
   * @param data
   * @param params
   * @returns {Promise}
   */
  update(id, data, params) {
    return new Promise((resolve, reject) => {
      this.patch(id, data, params).then((r) => {
        resolve(r);
      });
    });
  }

  /**
   * FeathersJS Service Patch
   * @param id
   * @param data
   * @param params
   * @returns {Promise}
   */
  patch(id, data, params) {
    return new Promise((resolve, reject) => {
      this.get(id, params)
        .then(_obj => this.schema()
          .then(bucket => bucket
            .replace(this._key(id), Object.assign(Object.assign(_obj, data), { _type: this.opts.name }), (err, result) => {
              resolve(this.get(id, params));
            })
          )
        )
    });
  }

  /**
   * FeathersJS Service Remove
   * @param id
   * @param params
   */
  remove(id, params) {
    return new Promise((resolve, reject) => {
      resolve(this.get(id, params)
        .then((data) => this.schema()
          .then(bucket => bucket.remove(this._key(this._id(data))))
        ));
    });
  }
}

module.exports = Service;
