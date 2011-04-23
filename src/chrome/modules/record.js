EXPORTED_SYMBOLS=["ItemRecord", "extractPrice"];

const Cc = Components.classes;
const Ci = Components.interfaces;
Components.utils.import("resource://pp/itemtype.js");
Components.utils.import("resource://pp/views.js");

// price - price of a single item
// cost - cost of a whole record
// isk - pretty string displaying price

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
        var bpID = this._type.bp;
        this._waste = this._type.waste;
        this.deps.raw = this._type.raw;
        this.deps.extra = this._type.extra;
        this.deps.bp = [i for each (i in this._view.pr.project.blueprints) if (i.type == bpID)].
                sort(function (a, b) b.me - a.me);
    }
}

// this._type.price forces price update from current price profile

ItemRecord.prototype = {
    _cnt:       0,
    deps: {
        raw:    {},
        extra:  {},
        bp:     [],
    },

    get id()    this._id = this._isBP ? [this._tid, '_', this._me].join('') : this._tid,
    get name()  this._name = this._tid == 'isk' ? 'ISK' : this._type.type.name,

    get itm()   this.name,
    get type()  this._tid,

    set cnt(count)  {
        count = count || 0;
        this.rmFromTotal();
        this._cnt = count;
        this._cntStr = Math.ceil(count).toLocaleString();
        this.addToTotal();
    },
    get cnt()   this._cntStr,
    get count() this._cnt,

    get price() this._price !== undefined ? this._price : this._type.price,
    set price(p) this._price = p,

    get cost()  {
        var count = safeCnt(this._cnt);
        if (this._price !== undefined)  // Ignore profiles, our price is fixed
            return count * this._price;
        if (this._isBP)                 // blueprints are free unless fixed price is set
            return 0;
        var price = this._type.price;
        if (price == -1)
            return -1;
        return count * price;
    },

    addToTotal:     function () {
        var cost = this.cost;
        if (cost != -1)
            return this._view.costAdd(cost);

        // price is being fetched
        if (this._updateInitiated)
            return;
        this._updateInitiated = true;

        let self = this;
        this._type.getPriceAsync(function (price) {
            delete self._updateInitiated;
            self._view.costAdd(safeCnt(self._cnt) * price);
        });
    },

    rmFromTotal:    function () {
        var cost = this.cost;
        if (cost != -1)
            this._view.costAdd(-cost);
    },

    // this is re-invoked automatically by tree painter
    get isk()   this._updateInitiated
        ? ' '
        : (Math.ceil(this.price*100)/100).toLocaleString(),
    get me()    this._isBP ? this._me : ' ',
};

function safeCnt(cnt) cnt == Infinity ? 1 : cnt
