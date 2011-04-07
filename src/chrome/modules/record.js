EXPORTED_SYMBOLS=["ItemRecord"];

const Cc = Components.classes;
const Ci = Components.interfaces;
Components.utils.import("resource://pp/itemtype.js");
Components.utils.import("resource://pp/views.js");

function ItemRecord(typeID, view, cnt, me) {
    this._view = view;
    this._tid = typeID;
    this._me = me;

    if (typeID == 'isk') {
        this._price = 1;
        this._isBP = false;
    } else {
        this._type = ItemType.byID(typeID);
        this._isBP = this._type.isBP;
    }

    this.cnt = cnt;

    if (typeID != 'isk') {
        var rec = this;
        this._type.getPriceAsync(function (p) rec._updateCost(p));
    }
}

ItemRecord.prototype = {
    get id()    this._id = this._isBP ? [this._tid, '_', this._me].join('') : this._tid,
    get name()  this._name = this._tid == 'isk' ? 'ISK' : this._type.type.name,

    get itm()   this.name,
    get type()  this._tid,

    set cnt(count)  {
        this._cnt = count;
        this._cntStr = count.toLocaleString();
        if (count == Infinity)
            this._price = 0;

        this._updateCost();
    },
    get cnt()   this._cntStr,
    get count() this._cnt,

    get price() this._price !== undefined ? this._price : this._type.price,
    set price(p) {
        this._price = p;
        this._updateCost();
    },

    _updateCost: function (price) {
        if (this._cost && !this._isBP)
            this._view.total -= this._cost;
        this._cost = (this._cnt == Infinity ? 1 : this._cnt) * (price ? price : this.price);
        if (!this._isBP)
            this._view.total += this._cost;
    },

    get isk()   this._cost === undefined ? ' ' : Math.round(this.price*100)/100,
    get me()    this._isBP ? this._me : ' ',
};

