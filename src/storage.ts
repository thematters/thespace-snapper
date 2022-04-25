import S3 from "aws-sdk/clients/s3";

export class Storage {
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
