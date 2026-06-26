// ── Car Rental Manager — Google Apps Script Backend ───────────────────────
// Deploy as: Execute as Me | Anyone (even anonymous)

var SS = SpreadsheetApp.getActiveSpreadsheet();

var SHEETS = {
  vehicles:     { name: 'Vehicles',     cols: ['id','make','model','year','plate','color','status','dailyRate','mileage','insuranceExpiry','regExpiry','notes'] },
  customers:    { name: 'Customers',    cols: ['id','name','phone','email','idNumber','licenseNumber','address','notes','createdAt'] },
  // Bookings is the single ledger for both booking and customer-payment rows.
  // Existing booking rows without recordType are still treated as bookings.
  bookings:     { name: 'Bookings',     cols: ['id','recordType','customerId','vehicleId','startDate','endDate','returnDate','dailyRate','totalAmount','deposit','cancelled','notes','createdAt','startTime','endTime','returnTime','bookingId','amount','date','method','type'] },
  // Expenses is the single ledger for both expense and stakeholder records.
  // Existing expense rows without recordType are still treated as expenses.
  expenses:     { name: 'Expenses',     cols: ['id','recordType','vehicleId','type','amount','date','stakeholderId','partName','partCategory','replacedPartCondition','replacedPartDisposition','description','notes','name','stakeholderType','phone','stakeholderNotes'] },
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
    else if (action === 'saveBooking')        result = saveBookingRow(JSON.parse(e.parameter.data));
    else if (action === 'deleteBooking')      result = deleteBookingRow(e.parameter.id);
    else if (action === 'savePayment')        result = savePaymentRow(JSON.parse(e.parameter.data));
    else if (action === 'deletePayment')      result = deletePaymentRow(e.parameter.id);
    else if (action === 'saveExpense')        result = saveRow('expenses',     JSON.parse(e.parameter.data));
    else if (action === 'deleteExpense')      result = deleteRow('expenses',   e.parameter.id);
    else if (action === 'saveStakeholder')     result = saveStakeholderRow(JSON.parse(e.parameter.data));
    else if (action === 'deleteStakeholder')   result = deleteStakeholderRow(e.parameter.id);
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
  var bookingLedger = readSheet('bookings');
  var bookings = bookingLedger.filter(function(row) {
    return !isPaymentLedgerRow(row);
  });
  var payments = bookingLedger.filter(function(row) {
    return isPaymentLedgerRow(row);
  }).map(paymentFromLedgerRow);

  // Transition support for deployments that have not run the one-time
  // migrateBookingLedger function yet.
  readExistingSheet('Payments').forEach(function(row) {
    if (!payments.some(function(p) { return String(p.id) === String(row.id); })) {
      payments.push(row);
    }
  });

  var ledger = readSheet('expenses');
  var expenses = ledger.filter(function(row) {
    return String(row.recordType || '').toLowerCase() !== 'stakeholder';
  });
  var stakeholders = ledger.filter(function(row) {
    return String(row.recordType || '').toLowerCase() === 'stakeholder';
  }).map(stakeholderFromLedgerRow);

  // Transition support: keep old Stakeholders data visible until the one-time
  // migrateFinanceLedger action has been run on the deployed spreadsheet.
  readExistingSheet('Stakeholders').forEach(function(row) {
    if (!stakeholders.some(function(s) { return String(s.id) === String(row.id); })) {
      stakeholders.push(row);
    }
  });

  return {
    vehicles:     readSheet('vehicles'),
    customers:    readSheet('customers'),
    bookings:     bookings,
    payments:     payments,
    expenses:     expenses,
    stakeholders: stakeholders,
  };
}

// Field-based detection prevents a bad/misaligned recordType cell from hiding
// a real booking. Booking rows have trip/customer fields; payment rows point
// back to a booking through bookingId.
function isPaymentLedgerRow(row) {
  if (row.bookingId) return true;
  var hasBookingFields = !!(row.customerId || row.vehicleId || row.startDate || row.endDate || row.totalAmount);
  if (hasBookingFields) return false;
  return String(row.recordType || '').toLowerCase() === 'payment';
}

function paymentFromLedgerRow(row) {
  return {
    id: row.id,
    bookingId: row.bookingId,
    customerId: row.customerId,
    vehicleId: row.vehicleId,
    amount: row.amount,
    date: row.date,
    method: row.method,
    type: row.type,
    notes: row.notes
  };
}

function saveBookingRow(obj) {
  obj.recordType = 'booking';
  return saveRow('bookings', obj);
}

function savePaymentRow(obj) {
  return saveRow('bookings', {
    id: obj.id,
    recordType: 'payment',
    bookingId: obj.bookingId,
    customerId: obj.customerId,
    vehicleId: obj.vehicleId,
    amount: obj.amount,
    date: obj.date,
    method: obj.method,
    type: obj.type,
    notes: obj.notes
  });
}

function deleteBookingRow(id) {
  var result = deleteRow('bookings', id);
  deleteRowsWhere(getSheet('bookings'), 'bookingId', id);
  var legacyPayments = SS.getSheetByName('Payments');
  if (legacyPayments) deleteRowsWhere(legacyPayments, 'bookingId', id);
  return result;
}

function deletePaymentRow(id) {
  var result = deleteRow('bookings', id);
  var legacyPayments = SS.getSheetByName('Payments');
  if (legacyPayments) deleteRowFromSheet(legacyPayments, id);
  return result.ok ? result : { ok: true };
}

function stakeholderFromLedgerRow(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.stakeholderType,
    phone: row.phone,
    notes: row.stakeholderNotes
  };
}

function saveStakeholderRow(obj) {
  return saveRow('expenses', {
    id: obj.id,
    recordType: 'stakeholder',
    name: obj.name,
    stakeholderType: obj.type,
    phone: obj.phone,
    stakeholderNotes: obj.notes
  });
}

function deleteStakeholderRow(id) {
  var result = deleteRow('expenses', id);
  var legacy = SS.getSheetByName('Stakeholders');
  if (legacy) deleteRowFromSheet(legacy, id);
  return result.ok ? result : { ok: true };
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

// Reads a legacy tab only when it exists; unlike readSheet, it never creates it.
function readExistingSheet(name) {
  var sheet = SS.getSheetByName(name);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0].map(String);
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = fmtCell(row[i]); });
    return obj;
  }).filter(function(row) { return row.id; });
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
  return deleteRowFromSheet(sheet, id);
}

function deleteRowFromSheet(sheet, id) {
  var data  = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Row not found' };
}

function deleteRowsWhere(sheet, columnName, value) {
  var data = sheet.getDataRange().getValues();
  if (!data.length) return 0;
  var column = data[0].map(String).indexOf(columnName);
  if (column < 0) return 0;
  var deleted = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][column]) === String(value)) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }
  return deleted;
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

// One-time migration to the unified Bookings ledger.
// Run once from the Apps Script editor after deploying this version.
// Existing payment rows are copied into Bookings and the Payments tab is
// removed after a successful copy.
function migrateBookingLedger() {
  var bookingSheet = getSheet('bookings');
  var ledgerHeaders = bookingSheet.getRange(1, 1, 1, bookingSheet.getLastColumn()).getValues()[0].map(String);
  SHEETS.bookings.cols.forEach(function(col) {
    if (ledgerHeaders.indexOf(col) === -1) {
      var newCol = bookingSheet.getLastColumn() + 1;
      bookingSheet.getRange(1, newCol).setValue(col).setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
      ledgerHeaders.push(col);
    }
  });

  var legacyPayments = readExistingSheet('Payments');
  var existing = readSheet('bookings');
  var existingIds = {};
  existing.forEach(function(row) { existingIds[String(row.id)] = true; });

  var imported = 0;
  legacyPayments.forEach(function(payment) {
    if (existingIds[String(payment.id)]) return;
    savePaymentRow(payment);
    existingIds[String(payment.id)] = true;
    imported++;
  });

  var data = bookingSheet.getDataRange().getValues();
  var headers = data[0].map(String);
  var recordTypeCol = headers.indexOf('recordType');
  if (recordTypeCol >= 0) {
    for (var i = 1; i < data.length; i++) {
      var row = {};
      headers.forEach(function(header, column) {
        row[header] = fmtCell(data[i][column]);
      });
      var correctType = isPaymentLedgerRow(row) ? 'payment' : 'booking';
      if (String(data[i][recordTypeCol]).toLowerCase() !== correctType) {
        bookingSheet.getRange(i + 1, recordTypeCol + 1).setValue(correctType);
      }
    }
  }

  // Snapshot customer and vehicle IDs onto payment rows so Finance reports
  // stay informative even if their linked booking later becomes unavailable.
  var customerIdCol = headers.indexOf('customerId');
  var vehicleIdCol = headers.indexOf('vehicleId');
  var bookingById = {};
  for (var b = 1; b < data.length; b++) {
    var bookingRow = {};
    headers.forEach(function(header, column) {
      bookingRow[header] = fmtCell(data[b][column]);
    });
    if (!isPaymentLedgerRow(bookingRow)) {
      bookingById[String(bookingRow.id)] = bookingRow;
    }
  }
  for (var p = 1; p < data.length; p++) {
    var paymentRow = {};
    headers.forEach(function(header, column) {
      paymentRow[header] = fmtCell(data[p][column]);
    });
    if (!isPaymentLedgerRow(paymentRow)) continue;
    var linkedBooking = bookingById[String(paymentRow.bookingId)];
    if (!linkedBooking) continue;
    if (customerIdCol >= 0 && !data[p][customerIdCol]) {
      bookingSheet.getRange(p + 1, customerIdCol + 1).setValue(linkedBooking.customerId || '');
    }
    if (vehicleIdCol >= 0 && !data[p][vehicleIdCol]) {
      bookingSheet.getRange(p + 1, vehicleIdCol + 1).setValue(linkedBooking.vehicleId || '');
    }
  }

  var paymentSheet = SS.getSheetByName('Payments');
  if (paymentSheet) SS.deleteSheet(paymentSheet);

  return {
    ok: true,
    paymentsImported: imported,
    sheetRemoved: paymentSheet ? 'Payments' : '',
    ledgerSheet: 'Bookings'
  };
}

// One-time migration to the unified Expenses ledger.
// Run once from the Apps Script editor after deploying this version.
// Stakeholders are copied into Expenses, old expense rows are marked as
// expenses, and the now-redundant Stakeholders/StakeholderPayments tabs are
// removed. Stakeholder payment rows are intentionally not copied: recording
// an expense means it has already been paid.
function migrateFinanceLedger() {
  var expenseSheet = getSheet('expenses');
  var ledgerHeaders = expenseSheet.getRange(1, 1, 1, expenseSheet.getLastColumn()).getValues()[0].map(String);
  SHEETS.expenses.cols.forEach(function(col) {
    if (ledgerHeaders.indexOf(col) === -1) {
      var newCol = expenseSheet.getLastColumn() + 1;
      expenseSheet.getRange(1, newCol).setValue(col).setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
      ledgerHeaders.push(col);
    }
  });

  var stakeholders = readExistingSheet('Stakeholders');
  var existing = readSheet('expenses');
  var existingIds = {};
  existing.forEach(function(row) { existingIds[String(row.id)] = true; });

  var imported = 0;
  stakeholders.forEach(function(stakeholder) {
    if (existingIds[String(stakeholder.id)]) return;
    saveStakeholderRow(stakeholder);
    existingIds[String(stakeholder.id)] = true;
    imported++;
  });

  var data = expenseSheet.getDataRange().getValues();
  var headers = data[0].map(String);
  var recordTypeCol = headers.indexOf('recordType');
  if (recordTypeCol >= 0) {
    for (var i = 1; i < data.length; i++) {
      if (!data[i][recordTypeCol]) {
        expenseSheet.getRange(i + 1, recordTypeCol + 1).setValue('expense');
      }
    }
  }

  var removed = [];
  ['Stakeholders', 'StakeholderPayments'].forEach(function(name) {
    var sheet = SS.getSheetByName(name);
    if (sheet) {
      SS.deleteSheet(sheet);
      removed.push(name);
    }
  });

  return {
    ok: true,
    stakeholdersImported: imported,
    sheetsRemoved: removed,
    ledgerSheet: 'Expenses'
  };
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
