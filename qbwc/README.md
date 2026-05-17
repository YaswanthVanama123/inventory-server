# QuickBooks Desktop Sync — Setup Guide

This directory contains the assets to connect the inventory webapp's hourly stock sync to **QuickBooks Desktop** running inside a Windows VM.

## Architecture

```
Inventory webapp (DigitalOcean)               Windows VM (QuickBooks Desktop)
─────────────────────────────────             ──────────────────────────────────────
hourly cron → QuickBooksSyncQueue                  QuickBooks Web Connector (QBWC)
        ↑                                              │
        │                                   1. polls every 60 min
        │  REST: /api/qb-sync/*               2. authenticates with username/password
        │  SOAP: /qbwc  ◀──────────────────  3. fetches QBXML batch (≤25 items)
                                              4. submits to QuickBooks Desktop
        │                                     5. returns response XML
        │  ack: synced or failed     ◀────── 6. webapp marks records
```

The webapp **enqueues** sync records; the Web Connector inside the VM **pulls** them and pushes to QB Desktop.

---

## 1. Backend deployment (one-time)

After pulling the new code on your DigitalOcean droplet:

```bash
cd /var/www/inventory-backend

# Set strong credentials in .env (these must match the .QWC file installed on the VM)
echo "QBWC_USERNAME=qbsync" >> .env
echo "QBWC_PASSWORD=$(openssl rand -hex 16)" >> .env
echo "QB_INVENTORY_ADJUSTMENT_ACCOUNT=Inventory Asset" >> .env

# Restart so env + new routes take effect
pm2 restart all --update-env

# Verify QBWC endpoint responds
curl -s "https://inventory.enviromasternva.com/qbwc?wsdl" | head -5
# Should return XML starting with: <?xml version="1.0" encoding="utf-8"?>
```

Take note of the `QBWC_PASSWORD` value — you'll enter it inside the VM in step 3.

---

## 2. Install the Web Connector inside the QB Desktop VM

1. RDP into the Windows VM where QuickBooks Desktop is installed.
2. Download the latest QuickBooks Web Connector from Intuit:
   https://developer.intuit.com/app/developer/qbdesktop/docs/get-started/get-started-with-quickbooks-web-connector
3. Install it (next-next-finish). The installer puts `QBWebConnector.exe` in `C:\Program Files (x86)\Common Files\Intuit\QuickBooks\`.
4. **Open QuickBooks Desktop and sign in as Admin** before configuring the Web Connector — the first sync requires admin to approve the third-party app.

---

## 3. Configure the .QWC file

1. Copy `inventory-sync.qwc` from this repo to the VM (any location, e.g. `C:\QBSync\`).
2. Open it in Notepad and confirm:
   - `<AppURL>` = `https://inventory.enviromasternva.com/qbwc` (your real backend URL, HTTPS required by QBWC)
   - `<UserName>` = `qbsync` (or whatever you set as `QBWC_USERNAME` in `.env`)
3. **Do NOT** put the password in the `.QWC` file. You'll enter it in the Web Connector UI when you add the app.

---

## 4. Add the app to Web Connector

1. Launch **QuickBooks Web Connector** (Start menu → QuickBooks → Web Connector).
2. Click **Add an Application** → browse to the `.QWC` file → Open.
3. A dialog confirms: "Authorize New Web Service" → click **OK**.
4. **QuickBooks itself** will pop up a dialog: "An application is requesting access" → choose **Yes, whenever this QuickBooks company file is open** (or **Yes, always** if you want unattended sync).
5. Back in Web Connector, find the new row → enter the **password** in the Password column (the value of `QBWC_PASSWORD` from `.env`) → press Tab → it will ask "Do you want to save this password" → **Yes**.
6. Check the box at the far left of the row to enable the app.

---

## 5. Test the sync

In Web Connector:

1. Check the app's row → click **Update Selected**.
2. Watch the status bar at the bottom. Expected flow:
   - `Connecting to web service`
   - `Authenticating`
   - `Processing request`
   - `Sending data to QuickBooks`
   - `Receiving response`
   - `Done. 100%`

If you see errors in the Status column, double-click to view detail.

On the backend, tail PM2 logs to see the same flow:
```bash
pm2 logs --lines 100 | grep -i "qbwc\|qbsync"
```

---

## 6. Verify in QuickBooks Desktop

After a successful sync, open QB Desktop → **Vendors menu → Inventory Activities → Adjust Quantity/Value on Hand**. Recent adjustments should show up there with:
- TxnDate = today
- RefNumber = last 10 chars of the queue record `_id`
- Memo = "Hourly stock sync (batch SNAP-...)" for snapshots, or "Discrepancy (Shortage|Overage|...): <reason>" for discrepancies

---

## 7. Monitoring

Admin endpoints (require `admin` role):

| Method | Endpoint                              | Description                                   |
|--------|---------------------------------------|-----------------------------------------------|
| GET    | `/api/qb-sync/stats`                  | counts by status, last synced timestamp       |
| GET    | `/api/qb-sync/queue?status=pending`   | list queue records (paginated)                |
| POST   | `/api/qb-sync/retry/:id`              | reset a failed record back to pending         |
| POST   | `/api/qb-sync/trigger-snapshot`       | manually enqueue a snapshot now (skip cron)   |

The webapp's "QuickBooks Sync" page (under System & Admin) wraps these visually.

---

## 8. Troubleshooting

| Symptom                                    | Likely cause                                  | Fix                                                            |
|--------------------------------------------|-----------------------------------------------|----------------------------------------------------------------|
| `QBWC1012: invalid signature on QWC`       | The `.QWC` file was edited and saved as UTF-8 with BOM | Re-save as ANSI/UTF-8 without BOM                              |
| `0x80040408 — Could not start QuickBooks`  | QB Desktop is closed and "Yes, always" wasn't chosen | Open QB once and re-approve as "Yes, always"                  |
| `nvu` (invalid user) every time            | `QBWC_USERNAME`/`PASSWORD` mismatch           | Check `.env` matches what you typed in Web Connector           |
| `Item with name X not found`               | Category names in webapp don't match QB item names | Rename QB items to match canonical names in `RouteStarItemAlias` |
| Web Connector says "Done" but nothing in QB | App was approved without write access         | In QB: Edit menu → Preferences → Integrated Applications → enable read+write |

---

## 9. Field mapping

| Webapp                                     | QuickBooks                                    |
|--------------------------------------------|-----------------------------------------------|
| `categoryName` (e.g. "10-HARDWOUND WHITE") | Item full name (must match exactly)           |
| `stockRemaining`                           | `NewQuantity` on InventoryAdjustment (absolute) |
| `discrepancy.difference` (signed)          | `QuantityDifference` on InventoryAdjustment (delta) |
| `discrepancy.reason`                       | InventoryAdjustment Memo                      |
| Hardcoded                                  | AccountRef = `QB_INVENTORY_ADJUSTMENT_ACCOUNT` env (default "Inventory Asset") |
