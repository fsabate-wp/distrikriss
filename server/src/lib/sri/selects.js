/**
 * Columnas de un comprobante que se pueden enviar al cliente o al panel.
 *
 * Deja fuera `xml` (el XML firmado completo, que engordaba cada respuesta de
 * pedido con un documento de decenas de KB), la firma y las columnas internas
 * del SRI. El XML solo se sirve por los endpoints dedicados que lo piden de
 * forma explícita.
 */
export const invoiceSummarySelect = {
  id: true,
  number: true,
  docType: true,
  status: true,
  accessKey: true,
  authorizationNumber: true,
  authorizationDate: true,
  responseMessage: true,
  environment: true,
  totalFiscal: true,
}
