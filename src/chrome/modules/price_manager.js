EXPORTED_SYMBOLS=["price_manager"];
Components.utils.import("resource://pp/mdm.js");
Components.utils.import("resource://gre/modules/Services.jsm");

/* hard-coded set of variables and profiles */
MDM.createVariable("Median", "EVE Central", "all/median", "Median price", "Median", {});
MDM.createVariable("Amarr Sell", "EVE Central", "sell/min", "Lowest sell in Amarr", "AmarrSell", {usesystem: 30002187});
MDM.createVariable("Jita Sell", "EVE Central", "sell/min", "Lowest sell in Jita", "JitaSell", {usesystem: 30000142});
const profiles = {
    dfl:            MDM.createProfile("Default", "{Median}"),
    profileAmarr:   MDM.createProfile("Amarr sell", "{AmarrSell}"),
    profileJita:    MDM.createProfile("Jita sell", "{JitaSell}"),
}

const priceCache = {};
var list;
var curProfile;

function switchProfile() {
    curProfile = profiles[list.value];
    Services.prefs.setCharPref('jaet-pp.prices.selected-profile', list.value);
    Services.obs.notifyObservers(null, 'price-profile-change', null);
}

const price_manager = {
    addPriceProfileSelector:    function (cont) {
        var doc = cont.ownerDocument;
        var spc = doc.createElement('spacer');
        spc.setAttribute('flex', '1');
        cont.appendChild(spc);

        var selected;
        try {
            selected = Services.prefs.getCharPref('jaet-pp.prices.selected-profile');
        } catch (e) {
            // do nothing
        }

        if (!profiles[selected])
            selected = 'dfl';

        list = doc.createElement('menulist');
        list.setAttribute('label', 'Price profile');
        var popup = doc.createElement('menupopup');
        list.appendChild(popup);
        cont.appendChild(list);
        list.addEventListener('command', switchProfile, false);
        for (var p in profiles) {
            list.appendItem(profiles[p].name, p);
            if (p == selected)
                list.selectedIndex = list.itemCount - 1;
        }
        curProfile = profiles[selected];
        Services.obs.notifyObservers(null, 'price-profile-change', null);
    },
    getPriceForItemType:        function (typeID)
            curProfile.getPriceForTypeID(typeID),
    getPriceForItemTypeAsync:   function (typeID, handler)
            curProfile.getPriceForTypeIDAsync(typeID, handler),
};
