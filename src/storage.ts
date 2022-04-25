import type { IPFS as _IPFS } from "ipfs-core-types";

import { create as createIPFS } from "ipfs-http-client";
import S3 from "aws-sdk/clients/s3";

export class ObjectStorage {
  s3: S3;

  constructor(region: string, bucketName: string) {
    this.s3 = new S3({
      apiVersion: "2006-03-01",
      region: region,
      params: { Bucket: bucketName },
    });
  }

  async check(key: string): Promise<boolean> {
    try {
      await this.s3
        .headObject({ Key: key } as S3.Types.HeadObjectRequest)
        .promise();
      return true;
    } catch (err: any) {
      if (err?.code == "NotFound") {
        return false;
      } else {
        throw err;
      }
    }
  }
  async read(key: string): Promise<Buffer> {
    const chunks = [];
    const stream = this.s3
      .getObject({ Key: key } as S3.Types.GetObjectRequest)
      .createReadStream();
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async write(key: string, data: Buffer | string, contentType: string) {
    await this.s3
      .putObject(<S3.Types.PutObjectRequest>{
        Key: key,
        Body: data,
        ContentType: contentType,
      })
      .promise();
  }
}

export class IPFS {
  ipfs: _IPFS;

  constructor(infuraId: string, infuraSecret: string) {
    this.ipfs = createIPFS({
      host: "ipfs.infura.io",
      port: 5001,
      protocol: "https",
      headers: {
        authorization:
          "Basic " +
          Buffer.from(infuraId + ":" + infuraSecret).toString("base64"),
      },
    });
  }
  async read(key: string): Promise<Buffer> {
    const chunks = [];
    for await (const chunk of this.ipfs.cat(key)) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async writeAndReturnCid(data: Buffer | string): Promise<string> {
    const { cid: cid } = await this.ipfs.add({ content: data });
    return cid.toString();
  }
}
