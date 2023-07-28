import { exec } from "child_process";
import path from "path";

const filePath = path.resolve(
  process.cwd(),
  "node_modules",
  ".prisma",
  "client",
  "libquery_engine-debian-openssl-1.1.x.so.node",
);
const rpath = process.env.OPENSSL_PATH; // '/nix/store/scdxpq5923dz8f5hp4qczm8db2qx6zcy-openssl-1.1.1u/lib/';
if (rpath == undefined) {
  throw Error(
    "You must set $OPENSSL_PATH to point to the directory containing libssl.so.1.1 and libcrypto.so.1.1",
  );
}

exec(`patchelf --set-rpath ${rpath} ${filePath}`, (error, stdout, stderr) => {
  if (error) console.error(`exec error: ${error}`);
  if (stdout.length > 0) console.log(`stdout: ${stdout}`);
  if (stderr.length > 0) console.error(`stderr: ${stderr}`);
});
