import { createHmac } from 'node:crypto';
import { verifyMercadoPagoSignature } from '../../../../src/adapters/payments/verifyMercadoPagoSignature';

const secret = 'webhook-secret';
const ts = '1704908010';

function sign(manifest: string): string {
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

const valid = {
  xSignature: `ts=${ts},v1=${sign(`id:123456;request-id:req-1;ts:${ts};`)}`,
  xRequestId: 'req-1',
  dataId: '123456',
  secret,
};

describe('verifyMercadoPagoSignature', () => {
  it('accepts a signature built from the documented manifest', () => {
    expect(verifyMercadoPagoSignature(valid)).toBe(true);
  });

  it('accepts a signature whose manifest omits the missing request id', () => {
    const xSignature = `ts=${ts},v1=${sign(`id:123456;ts:${ts};`)}`;

    expect(verifyMercadoPagoSignature({ ...valid, xSignature, xRequestId: undefined })).toBe(true);
  });

  it('accepts the header parts in any order and with spaces', () => {
    const v1 = sign(`id:123456;request-id:req-1;ts:${ts};`);

    expect(verifyMercadoPagoSignature({ ...valid, xSignature: ` v1=${v1} , ts=${ts} ` })).toBe(true);
  });

  it('rejects a tampered v1, a missing header and a different request id', () => {
    const tampered = valid.xSignature.replace(/.$/, (last) => (last === '0' ? '1' : '0'));

    expect(verifyMercadoPagoSignature({ ...valid, xSignature: tampered })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...valid, xSignature: undefined })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...valid, xRequestId: 'req-2' })).toBe(false);
  });

  it('rejects a signature for another payment id or made with another secret', () => {
    expect(verifyMercadoPagoSignature({ ...valid, dataId: '999' })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...valid, secret: 'other-secret' })).toBe(false);
  });

  it('rejects a header without timestamp or without v1', () => {
    const v1 = sign(`id:123456;request-id:req-1;ts:${ts};`);

    expect(verifyMercadoPagoSignature({ ...valid, xSignature: `v1=${v1}` })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...valid, xSignature: `ts=${ts}` })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...valid, xSignature: 'garbage' })).toBe(false);
  });
});
