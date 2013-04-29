/* global describe it */

var props = require('../lib/props').defaultProps
  , Handle = require('../lib/handle')
  , NaiveFSM = require('../lib/fsm_naive')
  , signCRC = require('../lib/utils').signCRC
  , u = require('lodash')
  , assert = require('chai').assert
  , expect = require('chai').expect
  , log = console.log
//  , sprintf = require('printf')

describe("NaiveFSM", function(){
  var fsm, span, ofsm
    , i, fbm = []

  for (i=0; i <= props.maxBlkNum(); i+=1) fbm[i] = true

  describe("Constructor", function(){
    it("new NaiveFSM(fbm) should return a handle", function(){
      fsm  = new NaiveFSM(fbm)
      ofsm = new NaiveFSM(fbm)

      assert.ok(fsm)
    })
  })

  describe("fsm.alloc then fsm.free", function(){
    var blkNum

    describe("fsm.alloc props.minSpanNum()", function(){
      it(".alloc()", function(){
        blkNum = fsm.alloc(props.minSpanNum())
        expect(blkNum).to.be.a('number')
      })
    })

    describe("fsm.free props.minSpanNum()", function(){
      it("fsm.free above allocated object", function(){
        fsm.free(blkNum, props.minSpanNum())
      })
      it("fsm is equal to original NaiveFSM object", function(){
        //fsm.equal(ofsm)
        expect(fsm.equal(ofsm)).to.be.true
      })
    })

  })

  describe("fsm.alloc x3 props.minSpanNum(), then fsm.free [0,1,2]", function(){
    var blkNum = []

    describe("fsm.alloc x3 props.minSpanNum()", function(){
      it(".alloc() blkNum[0..2]", function(){
        for (var i=0; i<3; i++) {
          blkNum[i] = fsm.alloc(props.minSpanNum())
          expect(blkNum[i]).to.be.a('number')
        }
      })
    })

    describe("fsm.free [0,1,2]", function(){
      it("fsm.free blkNum[0]"
        , function(){ fsm.free(blkNum[0], props.minSpanNum()) })
      it("fsm.free blkNum[1]"
        , function(){ fsm.free(blkNum[1], props.minSpanNum()) })
      it("fsm.free blkNum[2]"
        , function(){ fsm.free(blkNum[2], props.minSpanNum()) })
      it("fsm is equal to original NaiveFSM object", function(){
        fsm.equal(ofsm)
      })
    })

  })

  describe("fsm.alloc x3 props.minSpanNum(), then fsm.free [0,2,1]", function(){
    var blkNum = []

    describe("fsm.alloc x3 props.minSpanNum()", function(){
      it(".alloc() blkNum[0..2]", function(){
        for (var i=0; i<3; i++) {
          blkNum[i] = fsm.alloc(props.minSpanNum())
          expect(blkNum[i]).to.be.a('number')
        }
      })
      it("expect fsm.spans[15].length === 2046", function(){
        expect(fsm.spans[15].length).to.equal(2046)
      })
      it("expect fsm.spans[14,13].length === 0", function(){
        expect(fsm.spans[14].length).to.equal(0)
        expect(fsm.spans[13].length).to.equal(0)
      })
      it("expect fsm.spans[12].length === 1", function(){
        //one span of 16 blocks with three single blocks extracted
        // spanNum = 15(orig) - 3 blocks == 12
        expect(fsm.spans[12].length).to.equal(1)
      })
      it("expect fsm.spans[0..11].length === 0", function(){
        for (var i=0; i<12; i++) {
          expect(fsm.spans[i].length).to.equal(0)
        }
      })
    })

    describe("fsm.free [0,2,1]", function(){
      it("fsm.free span[0]", function(){
        //first span; only one span freed; one total
        fsm.free(blkNum[0], props.minSpanNum())
        //first free span is separated from any bigger one by other two
        expect(fsm.spans[0].length).to.equal(1)
        //three blocks were pulled off 15
        // so there remains a 12 span
        expect(fsm.spans[12].length).to.equal(1)
      })
      it("fsm.free blkNum[2]", function(){
        //third span; only one span freed; two total
        fsm.free(blkNum[2], props.minSpanNum())
        //first free span is separated from any bigger one by other two
        expect(fsm.spans[0].length).to.equal(1)
        //three blocks were pulled off 15
        // freeing the last one merges with the 12 one
        expect(fsm.spans[13].length).to.equal(1)
      })
      it("fsm.free blkNum[1]", function(){
        //second span; should merge spans with first and thirteenth
        fsm.free(blkNum[1], props.minSpanNum())
        expect(fsm.spans[15].length).to.equal(2047)
      })
      it("fsm is equal to original NaiveFSM object", function(){
        fsm.equal(ofsm)
      })
    })

  })

  describe("fsm.alloc x3 props.maxSpanNum(), then fsm.free [0,1,2]", function(){
    var blkNum = []

    describe("fsm.alloc x3 props.maxSpanNum()", function(){
      it(".alloc() blkNum[0..2]", function(){
        for (var i=0; i<3; i++) {
          blkNum[i] = fsm.alloc(props.maxSpanNum())

          expect(blkNum[i]).to.be.a('number')
        }
      })
      it("expect fsm.spans[15].length === 2047-3", function(){
        expect(fsm.spans[15].length).to.equal(2044)
      })
      it("expect fsm.spans[0..14].length === 0", function(){
        for (var i=0; i<14; i++) expect(fsm.spans[i].length).to.equal(0)
      })
    })

    describe("fsm.free [0,1,2]", function(){
      it("fsm.free blkNum[0]"
        , function(){ fsm.free(blkNum[0], props.maxSpanNum()) })
      it("fsm.free blkNum[1]"
        , function(){ fsm.free(blkNum[1], props.maxSpanNum()) })
      it("fsm.free blkNum[2]"
        , function(){ fsm.free(blkNum[2], props.maxSpanNum()) })
      it("fsm is equal to original NaiveFSM object", function(){
        fsm.equal(ofsm)
      })
    })

  })

  describe("fsm.alloc x3 props.maxSpanNum(), then fsm.free [0,2,1]", function(){
    var blkNum = []

    describe("fsm.alloc x3 props.maxSpanNum()", function(){
      it(".alloc() blkNum[0..2]", function(){
        for (var i=0; i<3; i++) {
          blkNum[i] = fsm.alloc(props.maxSpanNum())

          expect(blkNum[i]).to.be.a('number')
        }
      })
    })

    describe("fsm.free [0,2,1]", function(){
      it("fsm.free blkNum[0]"
        , function(){ fsm.free(blkNum[0], props.minSpanNum()) })
      it("fsm.free blkNum[2]"
        , function(){ fsm.free(blkNum[2], props.minSpanNum()) })
      it("fsm.free blkNum[1]"
        , function(){ fsm.free(blkNum[1], props.minSpanNum()) })
      it("fsm is equal to original NaiveFSM object", function(){
        fsm.equal(ofsm)
      })
    })

  })

})
//    describe("", function(){
////    it("", function(){})
//    })
//    it("", function(){})
