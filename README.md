# serverless-snapper

## Design

see [design.md](./docs/design.md)

## Development

### Setting up

- npm and node 14.x for lambda function development and testing;
- the AWS CLI for using AWS CloudFarmation to deploy lambda and related resources:
  - [Get a AWS account](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-sign-up-for-aws.html)
  - [Install the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html)
  - [Configure the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html)
- install dependences: `make prepare`

### Deploy

Environment

```bash
# polygon-mumbai
cp .env.polygon-mumbai.example .env.polygon-mumbai

# polygon-mainnet
cp .env.polygon-mainnet.example .env.polygon-mainnet
```

Deploy stack

```bash
# polygon-mumbai
make deploy

# polygon-mainnet
make deploy NETWORK=ploygon-mainnet
```

Check stack Outputs

```bash
# polygon-mumbai
make output

# polygon-mainnet
make output NETWORK=ploygon-mainnet
```
