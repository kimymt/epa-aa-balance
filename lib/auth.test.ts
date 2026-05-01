import { describe, expect, test } from "bun:test";
import { checkBasicAuth } from "./auth";

describe("checkBasicAuth", () => {
  const expected = "admin:secretpass";
  const validHeader = `Basic ${btoa(expected)}`;

  test("returns missing-config when expected env var is undefined", () => {
    const result = checkBasicAuth(validHeader, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing-config");
  });

  test("returns missing-config when expected env var is empty string", () => {
    const result = checkBasicAuth(validHeader, "");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing-config");
  });

  test("returns missing-header when authorization header is null", () => {
    const result = checkBasicAuth(null, expected);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing-header");
  });

  test("returns missing-header when scheme is not Basic", () => {
    const result = checkBasicAuth("Bearer xyz", expected);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing-header");
  });

  test("returns wrong-creds for incorrect password", () => {
    const wrongHeader = `Basic ${btoa("admin:wrong")}`;
    const result = checkBasicAuth(wrongHeader, expected);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("wrong-creds");
  });

  test("returns wrong-creds for malformed base64", () => {
    const result = checkBasicAuth("Basic !!!notbase64!!!", expected);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("wrong-creds");
  });

  test("returns ok for matching credentials", () => {
    const result = checkBasicAuth(validHeader, expected);
    expect(result.ok).toBe(true);
  });

  test("trims whitespace from header value", () => {
    const result = checkBasicAuth(`Basic ${btoa(expected)}   `, expected);
    expect(result.ok).toBe(true);
  });

  test("rejects header with empty Basic prefix only", () => {
    const result = checkBasicAuth("Basic ", expected);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("wrong-creds");
  });
});
