EXPORTED_SYMBOLS=["OrderTreeView", "BuyTreeView", "BuildTreeView", "SpentTreeView", "AcquiredTreeView"];
const Cc = Components.classes;
const Ci = Components.interfaces;
Components.utils.import("resource://pp/itemtype.js");
Components.utils.import("resource://pp/record.js");

var gPC = Cc["@aragaer/eve/market-data/provider;1?name=eve-central"].
    getService(Ci.nsIEveMarketDataProviderService);
var gEIS = Cc["@aragaer/eve/inventory;1"].getService(Ci.nsIEveInventoryService);

// base class for all 5 views
function TreeView() { }
TreeView.prototype = {
    get total()         this._total,
    set total(value) {
        this._total = Math.round(value*100)/100;
        if (this.totalLabel)
            this.totalLabel.value = this._total.toLocaleString()+" ISK total";
    },
    values:             [],
    records:            {},
    get rowCount()      this.values.length,
    get active()        this.values[this.activeRow],
    getCellText:        function (aRow, aCol) this.values[aRow][aCol.id.split('-')[0]] || '??',
    setCellText:        function (row,col,value) { },
    isEditable:         function (row,col) false,
    isContainer:        function (aRow) false,
    isContainerOpen:    function (aRow) false,
    isContainerEmpty:   function (aRow) false,
    getLevel:           function (aRow) 0,
    getParentIndex:     function (aRow) 0,
    hasNextSibling:     function (aRow, aAfterRow) 0,
    toggleOpenState:    function (aRow) { },
    setTree:            function (treebox) this.treebox = treebox,
    isSeparator:        function (aRow) !this.values[aRow].itm,
    isSorted:           function () false,
    getImageSrc:        function (row,col) null,
    getRowProperties:   function (row,props) { },
    getCellProperties:  function (row,col,props) { },
    getColumnProperties: function (colid,col,props) { },
    cycleHeader:        function (col) { },
    addRecord:          function (rec) {
        let oldrec = this.records[rec.id];
        var oldreccnt;
        if (oldrec) {
            oldreccnt = oldrec.cnt;
            oldrec.cnt += rec.count;
        } else {
            oldrec = rec;
            oldreccnt = 0;
        }
        if (oldrec.cnt > 0 && oldreccnt <= 0) {
            if (oldrec.type.isBP)
                this.values.splice(this.bpCount++, 0, rec);
            else
                this.values.push(rec);
        } else if (oldrec.cnt <= 0 && oldreccnt > 0) {
            var idx = this.values.indexOf(rec);
            if (idx != -1) {
                this.values.splice(idx, 1);
                if (oldrec.type.isBP)
                    this.bpCount--;
            }
            if (oldrec.cnt == 0)
                delete oldrec;
        }
    },
    getRecord:          function (rec_id) this.records[rec_id] || null,
};

/* 5 different views.
    - Build - simple list of items and counts
    - Order - same as Build but also price and total
    - Acquired - same as Order but with blueprints
    - Spent - same as Order but also includes 'isk'
    - Buy - that's where the magic is
*/

function OrderTreeView() { }
OrderTreeView.prototype = new TreeView();
OrderTreeView.prototype.rebuild = function () {
    this.treebox.rowCountChanged(0, -this.values.length);
    this.values = [];
    this.records = {};
    this.total = 0;
    for each (var itm in this.pr.project.order) {
        var rec = new ItemRecord(itm.type, this, itm.cnt);
        this.values.push(rec);
        this.records[rec.id] = rec;
    }
    this.treebox.rowCountChanged(0, this.values.length);
}

function SpentTreeView() { }
SpentTreeView.prototype = new TreeView();
SpentTreeView.prototype.rebuild = function () {
    this.treebox.rowCountChanged(0, -this.values.length);
    this.values = [];
    this.records = {};
    this.total = 0;
    var me = this;
    for each (var itm in this.pr.project.spent) {
        var rec = new ItemRecord(itm.type, this, itm.cnt);
        this.values.push(rec);
        this.records[rec.id] = rec;
    }
    this.treebox.rowCountChanged(0, this.values.length);
}

function BuyTreeView() { }
BuyTreeView.prototype = new TreeView();
BuyTreeView.prototype.isBlueprint = function (aRow) aRow < this.bpCount;
BuyTreeView.prototype.getImageSrc = function (row,col)
        this.values[row].isk && this.values[row].isk == ' ' && col.id.split('-')[0] == 'isk'
            ? "chrome://pp/content/img/loading.gif"
            : null,
BuyTreeView.prototype.rebuild = function () {
    this.treebox.rowCountChanged(0, -this.values.length);
    this.values = [];
    this.records = {};
    let tmp = this.pr.project.buy = {};
    let tmpbp = this.pr.project.bp_buy = {};
    this.bpCount = 0;
    this.total = 0;
    for each (var itm in this.pr.project.order)
        tmp[itm.type] = itm.cnt;
    for each (var itm in this.pr.project.build) {
        if (tmp[itm.type])
            tmp[itm.type] -= itm.cnt;
        else
            tmp[itm.type] = -itm.cnt;
        var type = ItemType.byID(itm.type);
        var waste = type.waste/100;
        var cnt = itm.cnt;
        var me_list = this.pr.project.getBPMEList(itm.type);
        while (cnt) {
            var bp = me_list.next();
            var wasteMul = 1 + waste/(1+bp.me);
            var q = Math.min(cnt, bp.cnt);
            for (let [m,u] in Iterator(type.raw)) {
                if (!tmp[m])
                    tmp[m] = 0;
                tmp[m] += q*Math.round(wasteMul*u);
            }
            if (bp.fake)
                tmpbp[type.bp] = q;
            cnt -= q;
        }
        for (let [m,u] in Iterator(type.extra)) {
            if (!tmp[m])
                tmp[m] = 0;
            tmp[m] += itm.cnt * u;
        }
    }
    for each (var itm in this.pr.project.acquired)
        if (tmp[itm.type])
            tmp[itm.type] -= itm.cnt;
        else
            tmp[itm.type] = -itm.cnt;
    for (var i in tmpbp) {
        var rec = new ItemRecord(i, this, tmpbp[i], 0);
        this.records[rec.id] = rec;
        if (tmpbp[i] <= 0)
            continue;
        var type = ItemType.byID(i);
        this.values.push({
            type:   i,
            itm:    type.type.name,
            cnt:    tmpbp[i],
            isk:    'N/A',
        });
        this.bpCount++;
    }
    if (this.values.length)             // if any blueprints
        this.values.push({itm: false}); // separator
    for (var i in tmp) {
        var rec = new ItemRecord(i, this, tmp[i]);
        this.records[rec.id] = rec;
        if (tmp[i] <= 0)
            continue;
        var type = ItemType.byID(i);
        var me = this;
        this.values.push(rec);
    }
    this.treebox.rowCountChanged(0, this.values.length);
}

function BuildTreeView() { }
BuildTreeView.prototype = new TreeView();
BuildTreeView.prototype.rebuild = function () {
    this.treebox.rowCountChanged(0, -this.values.length);
    this.values = [];
    this.records = {};
    for each (var itm in this.pr.project.build) {
        var rec = new ItemRecord(itm.type, this, itm.cnt);
        this.records[rec.id] = rec;
        this.values.push(rec);
    }
    this.treebox.rowCountChanged(0, this.values.length);
}

function AcquiredTreeView() { }
AcquiredTreeView.prototype = new TreeView();
AcquiredTreeView.prototype.isBlueprint = function (aRow) aRow < this.bpCount;
AcquiredTreeView.prototype.rebuild = function () {
    this.treebox.rowCountChanged(0, -this.values.length);
    this.values = [];
    this.records = {};
    this.total = 0;
    var me = this;
    for each (var itm in this.pr.project.blueprints) {
        var rec = new ItemRecord(itm.type, this, itm.cnt || Infinity, itm.me);
        this.records[rec.id] = rec;
        this.values.push(rec);
    }
    this.bpCount = this.values.length;
    if (this.values.length)     // Separator
        this.values.push({itm: false});
    for each (var itm in this.pr.project.acquired) {
        var rec = new ItemRecord(itm.type, this, itm.cnt);
        this.values.push(rec);
        this.records[rec.id] = rec;
    }
    this.treebox.rowCountChanged(0, this.values.length);
}

