EXPORTED_SYMBOLS=["ItemType"];
const Cc = Components.classes;
const Ci = Components.interfaces;

var gPC = Cc["@aragaer/eve/market-data/provider;1?name=eve-central"].
    getService(Ci.nsIEveMarketDataProviderService);
var gEIS = Cc["@aragaer/eve/inventory;1"].getService(Ci.nsIEveInventoryService);

Components.utils.import("resource://gre/modules/Services.jsm");

const Queries = {
    getBPByType:    "select blueprintTypeID, wasteFactor, techLevel from invBlueprintTypes where productTypeID=:tid",
    getRawMats:     "select materialTypeID as tid, quantity from invTypeMaterials where typeID=:tid",
    getExtraMats:   "select requiredTypeID as tid, quantity, damagePerJob from ramTypeRequirements " +
            "where typeID=:bpid and activityID=1;",
}, Stms = { };

const AllItemTypes = {};
function ItemType(typeID) {
    this.id = typeID;
    this._bp = this._waste = null;
}

ItemType.byID = function (typeID) {
    if (!AllItemTypes[typeID])
        AllItemTypes[typeID] = new ItemType(typeID);
    return AllItemTypes[typeID];
}

ItemType.prototype = {
    get type() {
        this.__defineGetter__('type', function () this._type);
        return this._type = gEIS.getItemType(this.id);
    },
    get bp()    this._getBPAndWaste('_bp'),
    get tl()    this._getBPAndWaste('_tl'),
    get waste() this._getBPAndWaste('_waste'),
    _getBPAndWaste: function (arg) {
        this.__defineGetter__('bp',     function () this._bp);
        this.__defineGetter__('tl',     function () this._tl);
        this.__defineGetter__('waste',  function () this._waste);
        let stm = Stms.getBPByType;
        try {
            stm.params.tid = this.id;
            if (stm.step()) {
                this._bp = stm.row.blueprintTypeID;
                this._waste = stm.row.wasteFactor;
                this._tl = stm.row.techLevel;
            }
        } catch (e) {
            println("Production planner: getBPByType for "+this.id+": "+e);
        } finally { stm.reset(); }
        return this[arg];
    },
    _getRawAndExtra:    function (arg) {
        this.__defineGetter__('raw', function () this._raw);
        this.__defineGetter__('extra', function () this._extra);
        this._raw = {};
        this._extra = {};
        let stm = Stms.getRawMats;
        try {

            stm.params.tid = this.id;
            while (stm.step())
                this._raw[stm.row.tid] = stm.row.quantity;
        } catch (e) {
            dump("Filling 'raw' for "+this.type.name+": "+e+"\n");
        } finally { stm.reset(); }

        var reproc = [];
        let stm = Stms.getExtraMats;
        try {
            stm.params.bpid = this.bp;
            while (stm.step()) {
                if (stm.row.damagePerJob)
                    this._extra[stm.row.tid] = stm.row.quantity * stm.row.damagePerJob;
                if (stm.row.damagePerJob == 1)  // Extra reprocessed material
                    reproc.push(ItemType.byID(stm.row.tid));
            }
        } catch (e) {
            dump("Filling 'extra' for "+this.type.name+": "+e+"\n");
            dump(conn.lastErrorString+"\n");
        } finally { stm.reset(); }

        for each (var baseItem in reproc)
            for (var m in baseItem.raw) if (this._raw[m]) {
                this._raw[m] -= baseItem.raw[m];
                if (this._raw[m] < 0)
                    delete this._raw[m];
            }

        return this[arg];
    },
    get raw()   this._getRawAndExtra('_raw'),
    get extra() this._getRawAndExtra('_extra'),

    getPriceAsync:  function (handler, args) {
        var me = this;
        if (!this._price || this._price == -1)
            gPC.getPriceForItemAsync2(this.id, {}, function (price) {
                me._price = price.wrappedJSObject;
                if (handler)
                    handler(me._price, args);
            });
        else if (handler)
            handler(this._price, args);
    },
    get price() {
        this.__defineGetter__('price', function () this._price);
        this._price = -1;
        this.getPriceAsync();
        return this._price;
    },
    get isBP() this.type.category.id == Ci.nsEveCategoryID.CATEGORY_BLUEPRINT,
};

var gDB  = Cc["@aragaer/eve/db;1"].getService(Ci.nsIEveDBService);
var conn;
try {
    conn = gDB.getConnection();
} catch (e) {
    conn = null;
}

if (!conn) {
    Services.obs.addObserver({
        observe: function (aSubject, aTopic, aData) {
            try {
                conn = aSubject.QueryInterface(Ci.mozIStorageConnection);
                init();
            } catch (e) {
                dump("error in itemtype.js module: "+e+"\n");
                if (conn)
                    dump(conn.lastErrorString+"\n");
            }
            Services.obs.removeObserver(this);
        }
    }, 'eve-db-init', false);
} else
    init();



function init() {
    [Stms[i] = conn.createStatement(Queries[i]) for (i in Queries)];
}

