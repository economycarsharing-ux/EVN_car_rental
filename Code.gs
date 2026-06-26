// ── Car Rental Manager — Google Apps Script Backend ───────────────────────
// Deploy as: Execute as Me | Anyone (even anonymous)

var SS = SpreadsheetApp.getActiveSpreadsheet();

var SHEETS = {
  vehicles:     { name: 'Vehicles',     cols: ['id','make','model','year','plate','color','status','dailyRate','mileage','insuranceExpiry','regExpiry','notes'] },
  customers:    { name: 'Customers',    cols: ['id','name','phone','email','idNumber','licenseNumber','address','notes','createdAt'] },
  bookings:     { name: 'Bookings',     cols: ['id','customerId','vehicleId','startDate','endDate','returnDate','dailyRate','totalAmount','deposit','cancelled','notes','createdAt'] },
  payments:     { name: 'Payments',     cols: ['id','bookingId','amount','date','method','type','notes'] },
  expenses:     { name: 'Expenses',     cols: ['id','vehicleId','type','amount','date','stakeholderId','partName','replacedPartCondition','replacedPartDisposition','description','notes'] },
  stakeholders: { name: 'Stakeholders', cols: ['id','name','type','phone','notes'] },
};

// ── Entry point ────────────────────────────────────────────────────────────
function doGet(e) {
  var result;
  try {
    var action = e.parameter.action;
    if      (action === 'getAll')              result = getAll();
    else if (action === 'saveVehicle')         result = saveRow('vehicles',     JSON.parse(e.parameter.data));
    else if (action === 'deleteVehicle')       result = deleteRow('vehicles',   e.parameter.id);
    else if (action === 'saveCustomer')        result = saveRow('customers',    JSON.parse(e.parameter.data));
    else if (action === 'deleteCustomer')      result = deleteRow('customers',  e.parameter.id);
    else if (action === 'saveBooking')         result = saveRow('bookings',     JSON.parse(e.parameter.data));
    else if (action === 'deleteBooking')       result = deleteRow('bookings',   e.parameter.id);
    else if (action === 'savePayment')         result = saveRow('payments',     JSON.parse(e.parameter.data));
    else if (action === 'deletePayment')       result = deleteRow('payments',   e.parameter.id);
    else if (action === 'saveExpense')         result = saveRow('expenses',     JSON.parse(e.parameter.data));
    else if (action === 'deleteExpense')       result = deleteRow('expenses',   e.parameter.id);
    else if (action === 'saveStakeholder')     result = saveRow('stakeholders', JSON.parse(e.parameter.data));
    else if (action === 'deleteStakeholder')   result = deleteRow('stakeholders',e.parameter.id);
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
    expenses:     readSheet('expenses'),
    stakeholders: readSheet('stakeholders'),
  };
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

function fmtCell(val) {
  if (val instanceof Date) {
    // Sheets returns date cells as Date objects — format as YYYY-MM-DD
    var y = val.getFullYear();
    var m = ('0' + (val.getMonth() + 1)).slice(-2);
    var d = ('0' + val.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  return (val === undefined || val === null) ? '' : String(val);
}

function readSheet(key) {
  var sheet = getSheet(key);
  var cols  = SHEETS[key].cols;
  var data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(function(row) {
    var obj = {};
    cols.forEach(function(c, i) { obj[c] = fmtCell(row[i]); });
    return obj;
  }).filter(function(r) { return r.id; });
}

function saveRow(key, obj) {
  var sheet = getSheet(key);
  var cols  = SHEETS[key].cols;
  var data  = sheet.getDataRange().getValues();

  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(obj.id)) { rowIdx = i + 1; break; }
  }

  var rowData = cols.map(function(c) { return obj[c] !== undefined ? obj[c] : ''; });

  if (rowIdx > 0) {
    sheet.getRange(rowIdx, 1, 1, cols.length).setValues([rowData]);
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

// ── First-run / migration setup ────────────────────────────────────────────
// Run this once after updating the schema to recreate missing sheets.
function setupSheets() {
  Object.keys(SHEETS).forEach(function(key) { getSheet(key); });
  SpreadsheetApp.getUi().alert('All sheets ready!');
}
