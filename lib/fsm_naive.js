
var u = require('lodash')
  , assert = require('assert')
  , Props = require('./props')
  , Handle = require('./handle')

/* IDEA: FreeSpaceMap abstract base class
 *
 * function FreeSpaceMap(segNum, buffer)   // abstract base class
 * FreeSpaceMap.prototype.alloc(numBlocks) // abstract
 * FreeSpaceMap.prototype.free(handle)     // abstract
 * FreeSpaceMap.prototype.validate(span)   // abstract
 */


/* Strategy: whatever is easy to implement
 * Alloc:
 *   0) remove exact match gap off the end of the free gap list (pop), and
 *      update the beg/end indexies.
 *   1) remove next largest available gap off free gap list (pop), split it
 *      up and re-store remainding gap and update the beg/end indexies.
 *
 * Free:
 *   0) determine if block span is adjacent to any free block gaps.
 *     If so merge upto 16 (store remainder as appropriate) record on
 *     free gap list (append) & free gap beg/end indexies.
 *
 *
 */

exports = module.exports = NaiveFSM
function NaiveFSM(freeBlockMap, props) {
  this.props = props || Props.defaultProps

  assert.equal(freeBlockMap.length, this.props.numBlkNums)

  this.spans = []
  for (var g=this.props.minSpanNum; g<=this.props.maxSpanNum; g++) {
    this.spans[g] = [ /* begBlkNum0, ..., begBlkNumN */ ]
  }

  // fsi => free span index so we don't have to findSpanLoc
  this.fsiBeg = { /* begBlkNum : spanNum */ }
  this.fsiEnd = { /* endBlkNum : begBlkNum */ }

  for ( var curBlockNum = this.props.minBlkNum;
        curBlockNum <= this.props.maxBlkNum;
        curBlockNum += 1 )
  {
    var free = freeBlockMap[curBlockNum]
      , curSpanNum = this.props.minSpanNum
      , begBlkNum = curBlockNum

    if (free) {

      while(1) {
        if (!free || curSpanNum >= this.props.maxSpanNum || curBlockNum >= this.props.maxBlkNum) {
          //capture
          this.spans[curSpanNum].push(begBlkNum)
          this.fsiBeg[begBlkNum] = curSpanNum
          this.fsiEnd[begBlkNum+curSpanNum] = begBlkNum

          break
        }

        curBlockNum += 1
        curSpanNum += 1

        free = freeBlockMap[curBlockNum]
      } //while(1)
    } //if free
  } //foreach bit

  //return this
}

//util.inherits(NaiveFSM, FreeSpaceMap)


/** Determine if two NaiveFSM objects are equal
 *
 * @param {NaiveFSM} a
 * @param {NaiveFSM} b
 * @returns {boolean}
 */
NaiveFSM.equal = NaiveFSM_equal
function NaiveFSM_equal(a, b) {
  //a.spans         [0..15][0..N] => begBlkNum in order lowest to highest
  //a.fsiBeg        {begBlkNum: spanNum}
  //a.fsiEnd        {endBlkNum: begBlkNum}
  if ( !(a instanceof NaiveFSM) ) return false
  if ( !(b instanceof NaiveFSM) ) return false
  if ( !u.isEqual(a.spans       , b.spans       ) ) return false //<=1ms
  if ( !u.isEqual(a.fsiBeg      , b.fsiBeg      ) ) return false //~3-4ms
  if ( !u.isEqual(a.fsiEnd      , b.fsiEnd      ) ) return false //~3-4ms
  return true
} //NaiveFSM_equal()


/** Determine a second NaiveFSM object is equal to the caller
 *
 * @param {NaiveFSM} fsm
 * @returns {boolean}
 */
NaiveFSM.prototype.equal = NaiveFSM__equal
function NaiveFSM__equal(fsm) {
  return NaiveFSM.equal(this, fsm)
} //NaiveFSM__equal()


/** Allocate a number of blocks of contiguous space
 *
 * @param {number} reqSpanNum [reqSpanNum=0] allocate one + spanNum blocks
 * @returns {number} begBlkNum where spanNum is implied
 */
NaiveFSM.prototype.alloc = NaiveFSM__alloc
function NaiveFSM__alloc(reqSpanNum) {
  if (reqSpanNum === undefined) reqSpanNum = this.props.minSpanNum

  var spanNum, begBlkNum
  for (spanNum = reqSpanNum; spanNum <= this.props.maxSpanNum; spanNum += 1) {
    if (this.spans[spanNum].length > 0) {
      begBlkNum = this._delete(spanNum, 0)
      //begBlkNum = this.spans[spanNum].shift() //remove from beggining
      //delete this.fsiBeg[begBlkNum]
      //delete this.fsiEnd[begBlkNum+spanNum]
      break
    }
  }
  if (spanNum > this.props.maxSpanNum)
    return undefined //no room available in FSM

  // if span size > number of blocs I'm looking for
  //   extract the number of blocks and reinsert the rest as a new span
  var remBegBlkNum, remSpanNum
  if ( spanNum > reqSpanNum ) {
    remBegBlkNum = begBlkNum + reqSpanNum + 1
    remSpanNum = spanNum - (reqSpanNum + 1)

    //re-insert remSpan; preserve ordering of this.spans[spanNum]
    this._insert(remBegBlkNum, remSpanNum)
  }

  return begBlkNum //and reqSpanNum is implicit
} //NaiveFSM__alloc()


//FIXME: remove spanNum argument get value from fsiBeg
/** Release allocated (blkNum, spanNum) tuple
 *
 * @param {number} begBlkNum first block in a span
 * @param {number} spanNum number of additional blocks
 * @returns {undefined}
 */
NaiveFSM.prototype.free = NaiveFSM__free
function NaiveFSM__free(begBlkNum, spanNum) {
  //FIXME: we need to make sure begBlkNum/spanNum blocks are not already
  //       in the free list. Or should this be done in Segment?

  var tSpanNum
    , hiBlkNum, hiSpanNum
    , loBlkNum, loSpanNum
    , idx, len

  hiBlkNum  = begBlkNum+spanNum+1
  if ( Handle.isValidBlockNum(hiBlkNum) /*in the correct range*/) {
    // test if hiBlkNum is a free span via existance in this.fsiBeg[]
    hiSpanNum = this.fsiBeg[hiBlkNum]
    if ( hiSpanNum !== undefined ) {
      len = this.spans[hiSpanNum].length
      for (idx=0; idx<len; idx++) {
        if (this.spans[hiSpanNum][idx] === hiBlkNum) break
      }
      //if it existed in this.fsiBeg[hiBlkNum]
      // then it must be in this.spans[hiSpanNum][]
      //if (idx === len) /*not found*/

      //remove hiBlkNum from this.spans & this.fsiBeg & this.fsiEnd
      this._delete(hiSpanNum, idx)

      //begBlkNum = /*unchanged*/
      spanNum += 1 + hiSpanNum //number of blocks is 1 + spanNum
    }
  }

  loBlkNum  = this.fsiEnd[begBlkNum-1]
  if ( Handle.isValidBlockNum(loBlkNum) /*in the correct range*/) {
    // test if loBlkNum is a free span via existance in this.fsiBeg[]
    loSpanNum = this.fsiBeg[loBlkNum]
    if ( loSpanNum !== undefined ) {
      len = this.spans[loSpanNum].length
      for (idx=0; idx<len; idx++) {
        if (this.spans[loSpanNum][idx] === loBlkNum) break
      }
      //if it existed in this.fsiBeg[loBlkNum]
      // then it must be in this.spans[loSpanNum][]
      //if (idx === len) /*not found*/

      //remove loBlkNum from this.spans & this.fsiBeg & this.fsiEnd
      this._delete(loSpanNum, idx)

      begBlkNum = loBlkNum
      spanNum += 1 + loSpanNum //number of blocks is 1 + spanNum
    }
  }

  var begBlkNum2, spanNum2
  while (spanNum > this.props.maxSpanNum) {
    // note: spans are designated by (begBlkNum, spanNum)
    //ex span=(0,16) => span'=(0,0) & span2=(1,15)
    //ex span=(0,32) => span'=(0,16) & span2=(17,15)
    //                  span''=(0,0) & span2'=(1,15)
    spanNum -= this.props.maxSpanNum + 1 //16
    begBlkNum2 = begBlkNum+spanNum /*endBlkNum*/ + 1
    spanNum2 = this.props.maxSpanNum

    this._insert(begBlkNum2, spanNum2)
  }

  this._insert(begBlkNum, spanNum)
} //NaiveFSM__free()


NaiveFSM.prototype._insert = NaiveFSM__insert
function NaiveFSM__insert(begBlkNum, spanNum) {
  var idx, len

  len = this.spans[spanNum].length
  for (idx = 0; idx < len; idx += 1) {
    if (this.spans[spanNum][idx] > begBlkNum) break
  }
//  if (idx === len) { //previous for stopped cuz it hit for-test; not break
//    //not sure
//  }

  //above loop either broke on idx<length or idx==length; both ok
  this.spans[spanNum].splice(idx, 0, begBlkNum)
  this.fsiBeg[begBlkNum] = spanNum
  this.fsiEnd[begBlkNum+spanNum] = begBlkNum

} //NaiveFSM__insert()


NaiveFSM.prototype._delete = NaiveFSM__delete
function NaiveFSM__delete(spanNum, idx) {
  var begBlkNum = this.spans[spanNum].splice(idx, 1)[0]
  delete this.fsiBeg[begBlkNum]
  delete this.fsiEnd[begBlkNum+spanNum]
  return begBlkNum
}


//