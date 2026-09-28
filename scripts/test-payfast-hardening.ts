#!/usr/bin/env node
/**
 * PayFast amount, signature encoding, canonical URLs, and ITN contracts.
 * Run: npm run test:payfast-hardening
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  PAYFAST_BELOW_MINIMUM_MESSAGE,
  PAYFAST_INVALID_AMOUNT_MESSAGE,
  PAYFAST_MIN_AMOUNT_ZAR,
  amountsMatchForPayFast,
  validatePayFastPayableAmount,
} from "../lib/payfast-amount";
import {
  buildPayFastCheckoutSignatureString,
  generatePayFastItnSignature,
  generatePayFastSignature,
  payfastUrlEncode,
} from "../lib/payfast-encoding";
import { buildPayFastInitiatePaymentData } from "../lib/payfast-initiate-fields";
import { validateBookingForPayFastInitiate } from "../lib/payfast-initiate-shared";
import {
  FIND_MYSPACE_PRODUCTION_ORIGIN,
  getPayFastCallbackBaseUrl,
} from "../lib/site-url";

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

{
  assert.equal(PAYFAST_MIN_AMOUNT_ZAR, 5);
  const belowMin = validatePayFastPayableAmount(4.99);
  assert.equal(belowMin.ok, false);
  if (!belowMin.ok) {
    assert.equal(belowMin.error, PAYFAST_BELOW_MINIMUM_MESSAGE);
  }
  assert.equal(validatePayFastPayableAmount(5).ok, true);
  assert.equal(validatePayFastPayableAmount(5.0).ok, true);
  assert.equal(validatePayFastPayableAmount(5.01).ok, true);
  assert.equal(validatePayFastPayableAmount(100).ok, true);
  const zero = validatePayFastPayableAmount(0);
  assert.equal(zero.ok, false);
  if (!zero.ok) {
    assert.equal(zero.error, PAYFAST_INVALID_AMOUNT_MESSAGE);
  }
  assert.equal(validatePayFastPayableAmount(-1).ok, false);
  assert.equal(validatePayFastPayableAmount("4.50").ok, false);
  assert.equal(validatePayFastPayableAmount("5.00").ok, true);
  assert.equal(validatePayFastPayableAmount(5.001).ok, true);
  assert.equal(validatePayFastPayableAmount(NaN).ok, false);
}

{
  const awaiting = {
    id: "booking-1",
    renter_id: "renter-1",
    owner_id: null,
    status: "accepted_awaiting_payment" as const,
    payment_status: "awaiting_payment" as const,
    space_id: "space-1",
  };
  assert.equal(
    validateBookingForPayFastInitiate({ ...awaiting, total_price: 4.99 }).ok,
    false
  );
  assert.equal(
    validateBookingForPayFastInitiate({ ...awaiting, total_price: 5 }).ok,
    true
  );
  assert.equal(
    validateBookingForPayFastInitiate({ ...awaiting, total_price: 100 }).ok,
    true
  );
  assert.equal(
    validateBookingForPayFastInitiate({ ...awaiting, total_price: 0 }).ok,
    false
  );
}

{
  assert.equal(payfastUrlEncode("hello"), "hello");
  assert.equal(payfastUrlEncode("hello world"), "hello+world");
  assert.equal(payfastUrlEncode("a&b"), "a%26b");
  assert.equal(payfastUrlEncode("a+b"), "a%2Bb");
  assert.equal(payfastUrlEncode("O'Brien"), "O%27Brien");
  assert.equal(payfastUrlEncode("Wow!"), "Wow%21");
  assert.equal(payfastUrlEncode("f(x)"), "f%28x%29");
  assert.equal(payfastUrlEncode("star*"), "star%2A");
  assert.equal(payfastUrlEncode("tilde~"), "tilde%7E");
  assert.equal(payfastUrlEncode("100%"), "100%25");
  assert.equal(payfastUrlEncode("a/b"), "a%2Fb");
  assert.equal(
    payfastUrlEncode("user+tag@findmyspace.co.za"),
    "user%2Btag%40findmyspace.co.za"
  );
  assert.equal(
    payfastUrlEncode("FindMySpace V1 (Acceptance) Test!"),
    "FindMySpace+V1+%28Acceptance%29+Test%21"
  );
  assert.equal(
    encodeURIComponent("O'Brien!()*~").replace(/%20/g, "+"),
    "O'Brien!()*~"
  );
  assert.notEqual(
    payfastUrlEncode("O'Brien!()*~"),
    encodeURIComponent("O'Brien!()*~").replace(/%20/g, "+")
  );
}

{
  const data: Record<string, string> = {
    merchant_id: "10000100",
    merchant_key: "46f0cd694581a",
    return_url: "http://www.yourdomain.co.za/return.php",
    cancel_url: "http://www.yourdomain.co.za/cancel.php",
    notify_url: "http://www.yourdomain.co.za/notify.php",
    name_first: "First Name",
    name_last: "Last Name",
    email_address: "test@test.com",
    m_payment_id: "1234",
    amount: "10.00",
    item_name: "Order#123",
  };
  const passphrase = "jt7NOE43FZPn";
  const canonical = buildPayFastCheckoutSignatureString(data, passphrase);
  assert.match(canonical, /^merchant_id=10000100&merchant_key=/);
  assert.match(canonical, /return_url=http%3A%2F%2Fwww\.yourdomain\.co\.za%2Freturn\.php/);
  assert.match(canonical, /name_first=First\+Name/);
  assert.match(canonical, /&passphrase=jt7NOE43FZPn$/);
  assert.doesNotMatch(canonical, /signature=/);
  const signature = generatePayFastSignature(data, passphrase);
  assert.equal(signature, md5(canonical));
  assert.equal(signature, signature.toLowerCase());
}

{
  const special: Record<string, string> = {
    merchant_id: "10000100",
    merchant_key: "key",
    return_url: "https://findmyspace.co.za/dashboard/my-bookings?payment=success&bookingId=abc",
    cancel_url: "https://findmyspace.co.za/dashboard/my-bookings?payment=cancelled&bookingId=abc",
    notify_url: "https://findmyspace.co.za/api/payfast/notify",
    name_first: "Ann",
    name_last: "O'Brien",
    email_address: "ann+test@findmyspace.co.za",
    m_payment_id: "abc",
    amount: "100.00",
    item_name: "FindMySpace - Hall (Main)!",
    custom_str1: "abc",
    custom_str2: "space-1",
  };
  const passphrase = "salt!'()*~ &+%";
  const canonical = buildPayFastCheckoutSignatureString(special, passphrase);
  assert.match(canonical, /name_last=O%27Brien/);
  assert.match(canonical, /item_name=FindMySpace\+-\+Hall\+%28Main%29%21/);
  assert.match(canonical, /email_address=ann%2Btest%40findmyspace\.co\.za/);
  assert.match(canonical, /passphrase=salt%21%27%28%29%2A%7E\+%26%2B%25$/);
  assert.equal(generatePayFastSignature(special, passphrase), md5(canonical));
}

{
  const body =
    "m_payment_id=b5a97793&pf_payment_id=999&payment_status=COMPLETE&item_name=FindMySpace+-+Hall&amount_gross=100.00&amount_fee=-2.30&amount_net=97.70&custom_str1=b5a97793&name_first=Ann&name_last=O%27Brien&email_address=ann%2Btest%40findmyspace.co.za&merchant_id=10000100&signature=deadbeef";
  const passphrase = "salt!'()*~";
  const expectedParam =
    "m_payment_id=b5a97793&pf_payment_id=999&payment_status=COMPLETE&item_name=FindMySpace+-+Hall&amount_gross=100.00&amount_fee=-2.30&amount_net=97.70&custom_str1=b5a97793&name_first=Ann&name_last=O%27Brien&email_address=ann%2Btest%40findmyspace.co.za&merchant_id=10000100&passphrase=salt%21%27%28%29%2A%7E";
  assert.equal(generatePayFastItnSignature(body, passphrase), md5(expectedParam));
}

{
  assert.equal(amountsMatchForPayFast(100, 100), true);
  assert.equal(amountsMatchForPayFast(100, 100.004), true);
  assert.equal(amountsMatchForPayFast("100.00", 100), true);
  assert.equal(amountsMatchForPayFast(100, 99.99), false);
  assert.equal(amountsMatchForPayFast(5, 4.99), false);
}

{
  const fields = buildPayFastInitiatePaymentData({
    appBaseUrl: FIND_MYSPACE_PRODUCTION_ORIGIN,
    booking: {
      id: "b5a97793-b8b1-436a-a7a0-40342a841f75",
      space_id: "space-1",
      total_price: 100,
    },
    spaceTitle: "FMS V1 Test Space",
    payerFirstName: "User5",
    payerLastName: "Testing",
    payerEmail: "connect.schalk+user5@gmail.com",
    merchantId: "merchant",
    merchantKey: "key",
  });
  assert.equal(
    fields.return_url,
    `${FIND_MYSPACE_PRODUCTION_ORIGIN}/dashboard/my-bookings?payment=success&bookingId=b5a97793-b8b1-436a-a7a0-40342a841f75`
  );
  assert.equal(
    fields.cancel_url,
    `${FIND_MYSPACE_PRODUCTION_ORIGIN}/dashboard/my-bookings?payment=cancelled&bookingId=b5a97793-b8b1-436a-a7a0-40342a841f75`
  );
  assert.equal(
    fields.notify_url,
    `${FIND_MYSPACE_PRODUCTION_ORIGIN}/api/payfast/notify`
  );
  assert.equal(fields.amount, "100.00");
}

{
  const saved = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL: process.env.VERCEL,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  };

  process.env.VERCEL_ENV = "production";
  process.env.VERCEL = "1";
  Object.assign(process.env, { NODE_ENV: "production" });
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.findmyspace.co.za";
  assert.equal(getPayFastCallbackBaseUrl(), FIND_MYSPACE_PRODUCTION_ORIGIN);

  process.env.VERCEL_ENV = "preview";
  assert.equal(getPayFastCallbackBaseUrl(), null);

  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;
  Object.assign(process.env, { NODE_ENV: "development" });
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  assert.equal(getPayFastCallbackBaseUrl(), "http://localhost:3000");

  process.env.NEXT_PUBLIC_SITE_URL = "https://abc123.vercel.app";
  assert.equal(getPayFastCallbackBaseUrl(), null);

  process.env.NEXT_PUBLIC_SITE_URL = "https://findmyspace.co.za";
  assert.equal(getPayFastCallbackBaseUrl(), FIND_MYSPACE_PRODUCTION_ORIGIN);

  if (saved.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = saved.VERCEL_ENV;
  if (saved.VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = saved.VERCEL;
  Object.assign(process.env, { NODE_ENV: saved.NODE_ENV });
  if (saved.NEXT_PUBLIC_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = saved.NEXT_PUBLIC_SITE_URL;
}

{
  const initiate = readFileSync("app/api/payfast/initiate/route.ts", "utf8");
  const notify = readFileSync("app/api/payfast/notify/route.ts", "utf8");
  const encoding = readFileSync("lib/payfast-encoding.ts", "utf8");
  assert.match(initiate, /getPayFastCallbackBaseUrl/);
  assert.doesNotMatch(initiate, /x-forwarded-host/);
  assert.doesNotMatch(initiate, /x-forwarded-proto/);
  assert.match(notify, /generatePayFastItnSignature/);
  assert.match(notify, /amountsMatchForPayFast/);
  assert.doesNotMatch(notify, /organisation_payouts/);
  assert.doesNotMatch(notify, /payout_status/);
  assert.match(encoding, /%21/);
  assert.match(encoding, /%27/);
  assert.match(encoding, /%7E/);
}

console.log("test-payfast-hardening: ok");
