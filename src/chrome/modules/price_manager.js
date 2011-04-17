EXPORTED_SYMBOLS=["do_magic"];
Components.utils.import("resource://pp/mdm.js");

function do_magic() {
    MDM.createVariable("Amarr Sell", "EVE Central", "sell/min", "Lowest sell in Amarr", "AmarrSell", {usesystem: 30002187});
    MDM.createVariable("Jita Sell", "EVE Central", "sell/min", "Lowest sell in Jita", "JitaSell", {usesystem: 30000142});
    var profile = MDM.createProfile("AmarrSell", "{AmarrSell}");
    var profile2 = MDM.createProfile("JitaSell+delivery", "{JitaSell}*1.01");
    var profile3 = MDM.createProfile("JitaSell plain", "{JitaSell}");
    dump("Trit price for profile AmarrSell = " + profile.getPriceForTypeID(34)+"\n");
    dump("Trit price for profile JitaSell+delivery = " + profile2.getPriceForTypeID(34)+"\n");
    dump("Trit price for profile JitaSell plain = " + profile3.getPriceForTypeID(34)+"\n");
}
