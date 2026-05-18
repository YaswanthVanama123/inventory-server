const crypto = require('crypto');
const syncService = require('./quickBooksSync.service');

const SERVER_VERSION = '1.0.0';
const SUPPORTED_QBXML_VERSION = '13.0';
const MAX_BATCH_SIZE = 25;

// In-memory session map: ticket -> { username, claimedIds: [], startedAt }
const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;

function pruneSessions() {
  const now = Date.now();
  for (const [ticket, session] of sessions.entries()) {
    if (now - session.startedAt > SESSION_TTL_MS) {
      sessions.delete(ticket);
    }
  }
}

function escapeXml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[a-zA-Z0-9_]+:)?${tag}>`, 'i'));
  return match ? match[1].trim() : null;
}

function wrapSoap(bodyXml) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>${bodyXml}</soap:Body>
</soap:Envelope>`;
}

function soapResponse(operation, valueXml) {
  return wrapSoap(`<${operation}Response xmlns="http://developer.intuit.com/"><${operation}Result>${valueXml}</${operation}Result></${operation}Response>`);
}

function arrayResponse(operation, items) {
  const inner = items.map(v => `<string xmlns="http://developer.intuit.com/">${escapeXml(v)}</string>`).join('');
  return wrapSoap(`<${operation}Response xmlns="http://developer.intuit.com/"><${operation}Result>${inner}</${operation}Result></${operation}Response>`);
}

function todayQB() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Build a single InventoryAdjustmentAdd block for one queue record.
 */
function buildAdjustment(record) {
  const reqId = String(record._id);
  const useDifference = record.type === 'discrepancy_adjustment';
  const qtyBlock = useDifference
    ? `<QuantityDifference>${Number(record.quantityDifference || 0)}</QuantityDifference>`
    : `<NewQuantity>${Number(record.newQuantity || 0)}</NewQuantity>`;

  return `<InventoryAdjustmentAddRq requestID="${reqId}">
    <InventoryAdjustmentAdd>
      <AccountRef>
        <FullName>${escapeXml(process.env.QB_INVENTORY_ADJUSTMENT_ACCOUNT || 'Inventory Asset')}</FullName>
      </AccountRef>
      <TxnDate>${todayQB()}</TxnDate>
      <RefNumber>${escapeXml(reqId.slice(-10).toUpperCase())}</RefNumber>
      <Memo>${escapeXml(record.memo || '')}</Memo>
      <InventoryAdjustmentLineAdd>
        <ItemRef>
          <FullName>${escapeXml(record.itemName)}</FullName>
        </ItemRef>
        ${qtyBlock}
      </InventoryAdjustmentLineAdd>
    </InventoryAdjustmentAdd>
  </InventoryAdjustmentAddRq>`;
}

function buildQBXMLBatch(records) {
  if (records.length === 0) return '';
  const body = records.map(buildAdjustment).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="${SUPPORTED_QBXML_VERSION}"?>
<QBXML>
  <QBXMLMsgsRq onError="continueOnError">
    ${body}
  </QBXMLMsgsRq>
</QBXML>`;
}

/**
 * Parse the response QBXML from QB Desktop. Returns array of:
 * { requestID, statusCode, statusSeverity, statusMessage, txnId }
 */
function parseQBXMLResponse(xml) {
  if (!xml) return [];
  const results = [];
  const rsRegex = /<InventoryAdjustmentAddRs\b([^>]*)>([\s\S]*?)<\/InventoryAdjustmentAddRs>/g;
  let m;
  while ((m = rsRegex.exec(xml)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    const requestID = (attrs.match(/requestID="([^"]+)"/) || [])[1];
    const statusCode = (attrs.match(/statusCode="([^"]+)"/) || [])[1] || '0';
    const statusSeverity = (attrs.match(/statusSeverity="([^"]+)"/) || [])[1] || 'Info';
    const statusMessage = (attrs.match(/statusMessage="([^"]+)"/) || [])[1] || '';
    const txnId = (inner.match(/<TxnID>([^<]+)<\/TxnID>/) || [])[1] || null;
    results.push({ requestID, statusCode, statusSeverity, statusMessage, txnId });
  }
  return results;
}

class QBWCService {
  /**
   * Return the WSDL describing the QBWC endpoints.
   * QBWC fetches this once to discover the service shape.
   */
  getWSDL(serviceUrl) {
    const tns = 'http://developer.intuit.com/';
    return `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions xmlns:tns="${tns}" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" targetNamespace="${tns}">
  <wsdl:types>
    <xsd:schema targetNamespace="${tns}">
      <xsd:element name="serverVersion"><xsd:complexType/></xsd:element>
      <xsd:element name="serverVersionResponse"><xsd:complexType><xsd:sequence><xsd:element name="serverVersionResult" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="clientVersion"><xsd:complexType><xsd:sequence><xsd:element name="strVersion" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="clientVersionResponse"><xsd:complexType><xsd:sequence><xsd:element name="clientVersionResult" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="authenticate"><xsd:complexType><xsd:sequence><xsd:element name="strUserName" type="xsd:string"/><xsd:element name="strPassword" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="authenticateResponse"><xsd:complexType><xsd:sequence><xsd:element name="authenticateResult"><xsd:complexType><xsd:sequence><xsd:element name="string" type="xsd:string" minOccurs="0" maxOccurs="unbounded"/></xsd:sequence></xsd:complexType></xsd:element></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="sendRequestXML"><xsd:complexType><xsd:sequence><xsd:element name="ticket" type="xsd:string"/><xsd:element name="strHCPResponse" type="xsd:string"/><xsd:element name="strCompanyFileName" type="xsd:string"/><xsd:element name="qbXMLCountry" type="xsd:string"/><xsd:element name="qbXMLMajorVers" type="xsd:int"/><xsd:element name="qbXMLMinorVers" type="xsd:int"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="sendRequestXMLResponse"><xsd:complexType><xsd:sequence><xsd:element name="sendRequestXMLResult" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="receiveResponseXML"><xsd:complexType><xsd:sequence><xsd:element name="ticket" type="xsd:string"/><xsd:element name="response" type="xsd:string"/><xsd:element name="hresult" type="xsd:string"/><xsd:element name="message" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="receiveResponseXMLResponse"><xsd:complexType><xsd:sequence><xsd:element name="receiveResponseXMLResult" type="xsd:int"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="connectionError"><xsd:complexType><xsd:sequence><xsd:element name="ticket" type="xsd:string"/><xsd:element name="hresult" type="xsd:string"/><xsd:element name="message" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="connectionErrorResponse"><xsd:complexType><xsd:sequence><xsd:element name="connectionErrorResult" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="getLastError"><xsd:complexType><xsd:sequence><xsd:element name="ticket" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="getLastErrorResponse"><xsd:complexType><xsd:sequence><xsd:element name="getLastErrorResult" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="closeConnection"><xsd:complexType><xsd:sequence><xsd:element name="ticket" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="closeConnectionResponse"><xsd:complexType><xsd:sequence><xsd:element name="closeConnectionResult" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
    </xsd:schema>
  </wsdl:types>
  <wsdl:message name="serverVersionSoapIn"><wsdl:part name="parameters" element="tns:serverVersion"/></wsdl:message>
  <wsdl:message name="serverVersionSoapOut"><wsdl:part name="parameters" element="tns:serverVersionResponse"/></wsdl:message>
  <wsdl:message name="clientVersionSoapIn"><wsdl:part name="parameters" element="tns:clientVersion"/></wsdl:message>
  <wsdl:message name="clientVersionSoapOut"><wsdl:part name="parameters" element="tns:clientVersionResponse"/></wsdl:message>
  <wsdl:message name="authenticateSoapIn"><wsdl:part name="parameters" element="tns:authenticate"/></wsdl:message>
  <wsdl:message name="authenticateSoapOut"><wsdl:part name="parameters" element="tns:authenticateResponse"/></wsdl:message>
  <wsdl:message name="sendRequestXMLSoapIn"><wsdl:part name="parameters" element="tns:sendRequestXML"/></wsdl:message>
  <wsdl:message name="sendRequestXMLSoapOut"><wsdl:part name="parameters" element="tns:sendRequestXMLResponse"/></wsdl:message>
  <wsdl:message name="receiveResponseXMLSoapIn"><wsdl:part name="parameters" element="tns:receiveResponseXML"/></wsdl:message>
  <wsdl:message name="receiveResponseXMLSoapOut"><wsdl:part name="parameters" element="tns:receiveResponseXMLResponse"/></wsdl:message>
  <wsdl:message name="connectionErrorSoapIn"><wsdl:part name="parameters" element="tns:connectionError"/></wsdl:message>
  <wsdl:message name="connectionErrorSoapOut"><wsdl:part name="parameters" element="tns:connectionErrorResponse"/></wsdl:message>
  <wsdl:message name="getLastErrorSoapIn"><wsdl:part name="parameters" element="tns:getLastError"/></wsdl:message>
  <wsdl:message name="getLastErrorSoapOut"><wsdl:part name="parameters" element="tns:getLastErrorResponse"/></wsdl:message>
  <wsdl:message name="closeConnectionSoapIn"><wsdl:part name="parameters" element="tns:closeConnection"/></wsdl:message>
  <wsdl:message name="closeConnectionSoapOut"><wsdl:part name="parameters" element="tns:closeConnectionResponse"/></wsdl:message>
  <wsdl:portType name="QBWebConnectorSvcSoap">
    <wsdl:operation name="serverVersion"><wsdl:input message="tns:serverVersionSoapIn"/><wsdl:output message="tns:serverVersionSoapOut"/></wsdl:operation>
    <wsdl:operation name="clientVersion"><wsdl:input message="tns:clientVersionSoapIn"/><wsdl:output message="tns:clientVersionSoapOut"/></wsdl:operation>
    <wsdl:operation name="authenticate"><wsdl:input message="tns:authenticateSoapIn"/><wsdl:output message="tns:authenticateSoapOut"/></wsdl:operation>
    <wsdl:operation name="sendRequestXML"><wsdl:input message="tns:sendRequestXMLSoapIn"/><wsdl:output message="tns:sendRequestXMLSoapOut"/></wsdl:operation>
    <wsdl:operation name="receiveResponseXML"><wsdl:input message="tns:receiveResponseXMLSoapIn"/><wsdl:output message="tns:receiveResponseXMLSoapOut"/></wsdl:operation>
    <wsdl:operation name="connectionError"><wsdl:input message="tns:connectionErrorSoapIn"/><wsdl:output message="tns:connectionErrorSoapOut"/></wsdl:operation>
    <wsdl:operation name="getLastError"><wsdl:input message="tns:getLastErrorSoapIn"/><wsdl:output message="tns:getLastErrorSoapOut"/></wsdl:operation>
    <wsdl:operation name="closeConnection"><wsdl:input message="tns:closeConnectionSoapIn"/><wsdl:output message="tns:closeConnectionSoapOut"/></wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="QBWebConnectorSvcSoap" type="tns:QBWebConnectorSvcSoap">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="serverVersion"><soap:operation soapAction="${tns}serverVersion"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation>
    <wsdl:operation name="clientVersion"><soap:operation soapAction="${tns}clientVersion"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation>
    <wsdl:operation name="authenticate"><soap:operation soapAction="${tns}authenticate"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation>
    <wsdl:operation name="sendRequestXML"><soap:operation soapAction="${tns}sendRequestXML"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation>
    <wsdl:operation name="receiveResponseXML"><soap:operation soapAction="${tns}receiveResponseXML"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation>
    <wsdl:operation name="connectionError"><soap:operation soapAction="${tns}connectionError"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation>
    <wsdl:operation name="getLastError"><soap:operation soapAction="${tns}getLastError"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation>
    <wsdl:operation name="closeConnection"><soap:operation soapAction="${tns}closeConnection"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="QBWebConnectorSvc">
    <wsdl:port name="QBWebConnectorSvcSoap" binding="tns:QBWebConnectorSvcSoap">
      <soap:address location="${serviceUrl}"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`;
  }

  /**
   * Main entry point. Routes the incoming SOAP request to the right handler.
   * `xml` is the raw SOAP envelope body.
   */
  async handleSoapRequest(xml, soapAction) {
    pruneSessions();

    const action = (soapAction || '').replace(/"/g, '').split('/').pop();
    let operation = action;
    if (!operation) {
      // Fallback: detect by element name in body
      const m = xml.match(/<(?:[a-zA-Z0-9_]+:)?(serverVersion|clientVersion|authenticate|sendRequestXML|receiveResponseXML|connectionError|getLastError|closeConnection)\b/);
      operation = m ? m[1] : '';
    }

    switch (operation) {
      case 'serverVersion':
        return soapResponse('serverVersion', SERVER_VERSION);

      case 'clientVersion': {
        // Returning empty string = no version-update warning
        return soapResponse('clientVersion', '');
      }

      case 'authenticate': {
        const username = extractTag(xml, 'strUserName');
        const password = extractTag(xml, 'strPassword');
        const expectedUser = process.env.QBWC_USERNAME;
        const expectedPass = process.env.QBWC_PASSWORD;

        if (!expectedUser || !expectedPass) {
          console.error('[QBWC] QBWC_USERNAME/QBWC_PASSWORD not configured');
          return arrayResponse('authenticate', ['', 'nvu']);
        }
        if (username !== expectedUser || password !== expectedPass) {
          console.warn('[QBWC] auth failed for user:', username);
          return arrayResponse('authenticate', ['', 'nvu']);
        }

        const ticket = crypto.randomUUID();
        sessions.set(ticket, {
          username,
          claimedIds: [],
          claimedById: new Map(),
          startedAt: Date.now()
        });

        // Check if there's anything to sync. Empty string = use companyfile from QWC.
        // Returning 'none' tells QBWC there's no work right now.
        const stats = await syncService.getStats();
        const hasWork = (stats.pending || 0) > 0;
        const companyFile = hasWork ? '' : 'none';

        console.log(`[QBWC] authenticated ${username}, ticket=${ticket}, pending=${stats.pending}`);
        return arrayResponse('authenticate', [ticket, companyFile]);
      }

      case 'sendRequestXML': {
        const ticket = extractTag(xml, 'ticket');
        const session = sessions.get(ticket);
        if (!session) {
          console.warn('[QBWC] sendRequestXML: invalid ticket');
          return soapResponse('sendRequestXML', '');
        }

        const records = await syncService.claimPending(MAX_BATCH_SIZE);
        if (records.length === 0) {
          return soapResponse('sendRequestXML', '');
        }

        session.claimedIds = records.map(r => String(r._id));
        session.claimedById = new Map(records.map(r => [String(r._id), r]));

        const qbxml = buildQBXMLBatch(records);
        console.log(`[QBWC] sending ${records.length} records to QB`);
        return soapResponse('sendRequestXML', escapeXml(qbxml));
      }

      case 'receiveResponseXML': {
        const ticket = extractTag(xml, 'ticket');
        const responseXml = extractTag(xml, 'response') || '';
        const session = sessions.get(ticket);
        if (!session) {
          return soapResponse('receiveResponseXML', '100'); // done
        }

        const results = parseQBXMLResponse(responseXml);
        const seen = new Set();
        for (const r of results) {
          seen.add(r.requestID);
          const isError = r.statusSeverity === 'Error' || (r.statusCode && r.statusCode !== '0');
          if (isError) {
            await syncService.markFailed(r.requestID, `${r.statusCode}: ${r.statusMessage}`);
          } else {
            await syncService.markSynced(r.requestID, r.txnId);
          }
        }
        // Any claimed-but-not-acknowledged records: release back to pending
        const unacked = session.claimedIds.filter(id => !seen.has(id));
        if (unacked.length > 0) {
          await syncService.releaseInProgress(unacked);
        }
        session.claimedIds = [];
        session.claimedById = new Map();

        // Check if there's more work. Return 0-99 = percent complete, 100 = done.
        const stats = await syncService.getStats();
        const morePending = (stats.pending || 0) > 0;
        const result = morePending ? '50' : '100';
        console.log(`[QBWC] receiveResponseXML: ${results.length} processed, ${unacked.length} unacked, more=${morePending}`);
        return soapResponse('receiveResponseXML', result);
      }

      case 'connectionError': {
        const ticket = extractTag(xml, 'ticket');
        const message = extractTag(xml, 'message');
        const session = sessions.get(ticket);
        if (session) {
          await syncService.releaseInProgress(session.claimedIds);
          session.claimedIds = [];
        }
        console.error('[QBWC] connectionError:', message);
        return soapResponse('connectionError', 'done');
      }

      case 'getLastError': {
        return soapResponse('getLastError', '');
      }

      case 'closeConnection': {
        const ticket = extractTag(xml, 'ticket');
        const session = sessions.get(ticket);
        if (session) {
          await syncService.releaseInProgress(session.claimedIds);
          sessions.delete(ticket);
        }
        return soapResponse('closeConnection', 'OK');
      }

      default:
        console.warn('[QBWC] unknown SOAP operation:', operation);
        return wrapSoap(`<soap:Fault xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><faultcode>soap:Client</faultcode><faultstring>Unknown operation: ${escapeXml(operation)}</faultstring></soap:Fault>`);
    }
  }
}

module.exports = new QBWCService();
