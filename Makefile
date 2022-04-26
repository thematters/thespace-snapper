NETWORK ?= polygon-mumbai
include .env.$(NETWORK)
DEPLOYMENT_TEMPLATE = deployment/snapper-deployment-bucket-template.yml
DEPLOYMENT_STACK_NAME = serverless-snapper-deployment
SNAPPER_TEMPLATE = deployment/snapper-template.yml
PACKAGED_TEMPLATE = packaged-template.yml

prepare: node_modules
	npx husky install
	
format:
	npx prettier --write .

lint:
	npx eslint --fix . --ext .ts

test:
	npx jest

clean:
	rm -rf dist/

node_modules:
	npm install

dist/snapper-handler.js: node_modules
	npx webpack --env goal=aws-lambda

dist/handler.zip: dist/snapper-handler.js
	zip -j dist/handler.zip dist/snapper-handler.js

build-lambda: clean node_modules
	npx webpack --env goal=aws-lambda

# delete-snapper:
# 	aws --profile ${AWS_PROFILE} --region ${AWS_REGION} cloudformation delete-stack --stack-name ${SNAPPER_STACK_NAME}

deploy: SHELL:=/bin/bash
deploy: clean dist/handler.zip
	DEPLOYMENT_BUCKET=$$(aws --profile ${AWS_PROFILE} --region ${AWS_REGION} s3 ls|grep '${DEPLOYMENT_STACK_NAME}'|awk '{ printf $$3}'); \
	[[ -z $$DEPLOYMENT_BUCKET ]] \
		&& aws --profile ${AWS_PROFILE} --region ${AWS_REGION} cloudformation deploy --stack-name ${DEPLOYMENT_STACK_NAME} --template-file ${DEPLOYMENT_TEMPLATE} \
		&& DEPLOYMENT_BUCKET=$$(aws --profile ${AWS_PROFILE} --region ${AWS_REGION} s3 ls|grep '${DEPLOYMENT_STACK_NAME}'|awk '{ printf $$3}') \
		|| echo $$DEPLOYMENT_BUCKET; \
	aws --profile ${AWS_PROFILE} --region ${AWS_REGION} cloudformation package \
		--s3-bucket $$DEPLOYMENT_BUCKET \
		--template-file ${SNAPPER_TEMPLATE} \
		--output-template-file ${PACKAGED_TEMPLATE}; \
	aws --profile ${AWS_PROFILE} --region ${AWS_REGION} cloudformation validate-template \
		--template-body file://${PACKAGED_TEMPLATE}; \
	aws --profile ${AWS_PROFILE} --region ${AWS_REGION} cloudformation deploy \
		--stack-name ${SNAPPER_STACK_NAME} \
		--template-file ${PACKAGED_TEMPLATE} \
		--capabilities CAPABILITY_IAM \
		--parameter-overrides \
			providerRpcHttpUrl=${PROVIDER_RPC_HTTP_URL} \
			privateKey=${SNAPPER_OWNER_PRIVATE_KEY} \
			alchemyApiKey=${ALCHEMY_API_KEY} \
			infuraIpfsProjectId=${INFURA_IPFS_PROJECT_ID} \
			infuraIpfsProjectSecret=${INFURA_IPFS_PROJECT_SECRET} \
			snapperAddress=${SNAPPER_ADDRESS} \
			thespaceAddress=${THESPACE_ADDRESS} \
			safeConfirmations=${SAFE_CONFIRMATIONS}; \
	rm ${PACKAGED_TEMPLATE};

output:
	aws --profile ${AWS_PROFILE} --region ${AWS_REGION} cloudformation describe-stacks --stack-name ${SNAPPER_STACK_NAME} --query Stacks[0].Outputs

