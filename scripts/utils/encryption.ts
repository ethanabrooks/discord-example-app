import crypto from "crypto";

export function encrypt(text) {
  const algorithm = "aes-256-ctr";
  const iv = crypto.randomBytes(16);
  const secretKey = Buffer.from(process.env.SECRET_KEY, "hex");
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);

  return {
    iv: iv.toString("hex"),
    content: encrypted.toString("hex"),
  };
}

export function decrypt(hash) {
  const algorithm = "aes-256-ctr";
  const secretKey = Buffer.from(process.env.SECRET_KEY, "hex");

  const decipher = crypto.createDecipheriv(
    algorithm,
    secretKey,
    Buffer.from(hash.iv, "hex"),
  );

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(hash.content, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString();
}

// Generate a 32 bytes (256 bits) long secret key
const secretKey = crypto.randomBytes(32).toString("hex");

export function encryptHMAC(text) {
  const secretKey = process.env.SECRET_KEY;
  const hmac = crypto.createHmac("sha256", secretKey);
  const encrypted = hmac.update(text).digest("hex");

  return encrypted;
}
