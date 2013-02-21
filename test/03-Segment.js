/* global describe it */

var Handle = require('../lib/handle')
  , NaiveFSM = require('../lib/fsm_naive')
  , Segment = require('../lib/segment')
  , signCRC = require('../lib/utils').signCRC
  , BLOCK_SIZE = require('../lib/constants').BLOCK_SIZE
  , u = require('lodash')
  , assert = require('chai').assert
  , expect = require('chai').expect
  , log = console.log
  , format = require('util').format
  , sprintf = require('printf')
  , printf = require('../lib/utils').printf
  , eprintf = require('../lib/utils').eprintf

describe("Segment", function(){
  var seg
    , buf = new Buffer(BLOCK_SIZE)

  buf.fill(0xff)
  signCRC(buf)

  describe("Constructor", function(){
    it("should instantiate a new object", function(){
      seg = new Segment(buf, NaiveFSM)
    })
  })


})