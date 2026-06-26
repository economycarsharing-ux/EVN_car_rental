// ── Car Rental Manager — Google Apps Script Backend ───────────────────────
// Deploy as: Execute as Me | Anyone (even anonymous)

var SS = SpreadsheetApp.getActiveSpreadsheet();

var SHEETS = {
  vehicles:     { name: 'Vehicles',     cols: ['id','make','model','year','plate','color','status','dailyRate','mileage','insuranceExpiry','regExpiry','notes'] },
  customers:    { name: 'Customers',    cols: ['id','name','phone','email','idNumber','licenseNumber','address','notes','createdAt'] },
  bookings:     { name: 'Bookings',     cols: ['id','customerId','vehicleId','startDate','endDate','returnDate','dailyRate','totalAmount','deposit','cancelled','notes','createdAt','startTime','endTime','returnTime'] },
  payments:     { name: 'Payments',     cols: ['id','bookingId','amount','date','method','type','notes'] },
  expenses:     { name: 'Expenses',     cols: ['id','vehicleId','type','amount','date','stakeholderId','partName','partCategory','replacedPartCondition','replacedPartDisposition','description','notes'] },
  stakeholders:         { name: 'Stakeholders',         cols: ['id','name','type','phone','notes'] },
  stakeholder_payments: { name: 'StakeholderPayments', cols: ['id','stakeholderId','date','amount','method','expenseIds','allocations','notes'] },
};

// ── Entry point ────────────────────────────────────────────────────────────
function doGet(e) {
  var result;
  try {
    var action = e.parameter.action;
    if      (action === 'getAll')             result = getAll();
    else if (action === 'saveVehicle')        result = saveRow('vehicles',     JSON.parse(e.parameter.data));
    else if (action === 'deleteVehicle')      result = deleteRow('vehicles',   e.parameter.id);
    else if (action === 'saveCustomer')       result = saveRow('customers',    JSON.parse(e.parameter.data));
    else if (action === 'deleteCustomer')     result = deleteRow('customers',  e.parameter.id);
    else if (action === 'saveBooking')        result = saveRow('bookings',     JSON.parse(e.parameter.data));
    else if (action === 'deleteBooking')      result = deleteRow('bookings',   e.parameter.id);
    else if (action === 'savePayment')        result = saveRow('payments',     JSON.parse(e.parameter.data));
    else if (action === 'deletePayment')      result = deleteRow('payments',   e.parameter.id);
    else if (action === 'saveExpense')        result = saveRow('expenses',     JSON.parse(e.parameter.data));
    else if (action === 'deleteExpense')      result = deleteRow('expenses',   e.parameter.id);
    else if (action === 'saveStakeholder')          result = saveRow('stakeholders',         JSON.parse(e.parameter.data));
    else if (action === 'deleteStakeholder')         result = deleteRow('stakeholders',        e.parameter.id);
    else if (action === 'saveStakeholderPayment')    result = saveRow('stakeholder_payments',  JSON.parse(e.parameter.data));
    else if (action === 'deleteStakeholderPayment')  result = deleteRow('stakeholder_payments',e.parameter.id);
    else if (action === 'migrateVehicleIds')         result = migrateVehicleIdsToPlates();
    else result = { error: 'Unknown action: ' + action };
  } catch(err) {
    result = { error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Read all data ──────────────────────────────────────────────────────────
function getAll() {
  return {
    vehicles:     readSheet('vehicles'),
    customers:    readSheet('customers'),
    bookings:     readSheet('bookings'),
    payments:     readSheet('payments'),
    expenses:             readSheet('expenses'),
    stakeholders:         readSheet('stakeholders'),
    stakeholderPayments:  readSheet('stakeholder_payments'),
  };
}

// ── Value formatter ────────────────────────────────────────────────────────
function fmtCell(val) {
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = ('0' + (val.getMonth() + 1)).slice(-2);
    var d = ('0' + val.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  return (val === undefined || val === null) ? '' : String(val);
}

// ── Sheet helpers ──────────────────────────────────────────────────────────
function getSheet(key) {
  var cfg = SHEETS[key];
  var sheet = SS.getSheetByName(cfg.name);
  if (!sheet) {
    sheet = SS.insertSheet(cfg.name);
    sheet.appendRow(cfg.cols);
    sheet.getRange(1, 1, 1, cfg.cols.length).setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Reads by actual sheet header names — robust against column reordering
// and automatically handles sheets that have fewer columns than the definition.
function readSheet(key) {
  var sheet = getSheet(key);
  var data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0].map(String);
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = fmtCell(row[i]); });
    return obj;
  }).filter(function(r) { return r.id; });
}

// Writes by actual sheet header names — auto-adds missing columns as needed.
function saveRow(key, obj) {
  var sheet = getSheet(key);
  var cfg   = SHEETS[key];

  // Refresh headers (may have grown)
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

  // Auto-add any columns from our definition that the sheet doesn't have yet
  cfg.cols.forEach(function(col) {
    if (headers.indexOf(col) === -1) {
      lastCol++;
      sheet.getRange(1, lastCol).setValue(col).setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
      headers.push(col);
    }
  });

  // Build row data in sheet column order
  var rowData = headers.map(function(h) {
    return obj[h] !== undefined ? obj[h] : '';
  });

  // Find existing row by id
  var data   = sheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(obj.id)) { rowIdx = i + 1; break; }
  }

  if (rowIdx > 0) {
    sheet.getRange(rowIdx, 1, 1, headers.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
  return { ok: true, id: obj.id };
}

function deleteRow(key, id) {
  var sheet = getSheet(key);
  var data  = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Row not found' };
}

// ── Setup / migration ──────────────────────────────────────────────────────
// Run once after schema changes — safe to run on existing data.
function setupSheets() {
  var added = [];
  Object.keys(SHEETS).forEach(function(key) {
    var cfg   = SHEETS[key];
    var sheet = SS.getSheetByName(cfg.name);
    if (!sheet) { getSheet(key); added.push(cfg.name + ' (created)'); return; }
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    cfg.cols.forEach(function(col) {
      if (headers.indexOf(col) === -1) {
        lastCol++;
        sheet.getRange(1, lastCol).setValue(col).setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
        headers.push(col);
        added.push(cfg.name + '.' + col);
      }
    });
  });
  var msg = added.length ? 'Added: ' + added.join(', ') : 'All sheets already up to date.';
  SpreadsheetApp.getUi().alert(msg);
}

// ── One-time migration: switch vehicle IDs to plate numbers ─────────────────
// Replaces each vehicle's random id with its plate (uppercased, made unique),
// and updates every vehicleId reference in Bookings and Expenses to match.
// SAFE: backs up Vehicles/Bookings/Expenses first, and only touches the
// id / vehicleId columns (never the other expense columns). Run once.
//
// Run it via the web app URL:  <GAS_URL>?action=migrateVehicleIds
// (Uses no getUi(), so it works from the web-app context of a standalone
//  script — returns a JSON summary instead of showing a dialog.)
function migrateVehicleIdsToPlates() {
  var vSheet = SS.getSheetByName('Vehicles');
  if (!vSheet) return { error: 'No Vehicles sheet found.' };

  // 1) Backup affected sheets
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  ['Vehicles','Bookings','Expenses'].forEach(function(name){
    var sh = SS.getSheetByName(name);
    if (sh) sh.copyTo(SS).setName(name + '_BAK_' + stamp);
  });

  // 2) Build oldId -> newId(plate) map from the Vehicles sheet
  var vData  = vSheet.getDataRange().getValues();
  var vHead  = vData[0].map(String);
  var idC    = vHead.indexOf('id');
  var plateC = vHead.indexOf('plate');
  if (idC < 0 || plateC < 0) return { error: 'Vehicles sheet is missing an id or plate column.' };

  var map = {};   // oldId -> newId
  var used = {};  // newId -> true (collision guard, e.g. duplicate plate 37JI433)
  for (var i = 1; i < vData.length; i++) {
    var oldId = String(vData[i][idC]);
    if (!oldId) continue;
    var plate = String(vData[i][plateC]).trim().toUpperCase();
    if (!plate) { map[oldId] = oldId; continue; }   // no plate -> keep existing id
    var cand = plate, n = 1;
    while (used[cand]) { n++; cand = plate + '-' + n; }
    used[cand] = true;
    map[oldId] = cand;
  }

  // 3) Write new ids into the Vehicles id column
  for (var i = 1; i < vData.length; i++) {
    var oldId = String(vData[i][idC]);
    if (map[oldId]) vSheet.getRange(i + 1, idC + 1).setValue(map[oldId]);
  }

  // 4) Update vehicleId references in Bookings and Expenses (that column only)
  var changed = { Bookings: 0, Expenses: 0 };
  ['Bookings','Expenses'].forEach(function(name){
    var sh = SS.getSheetByName(name);
    if (!sh) return;
    var data = sh.getDataRange().getValues();
    var c = data[0].map(String).indexOf('vehicleId');
    if (c < 0) return;
    for (var i = 1; i < data.length; i++) {
      var old = String(data[i][c]);
      if (map[old] && map[old] !== old) {
        sh.getRange(i + 1, c + 1).setValue(map[old]);
        changed[name]++;
      }
    }
  });

  return {
    ok: true,
    vehiclesRemapped: Object.keys(map).length,
    bookingsUpdated:  changed.Bookings,
    expensesUpdated:  changed.Expenses,
    backupSuffix:     '_BAK_' + stamp,
    map: map
  };
}
