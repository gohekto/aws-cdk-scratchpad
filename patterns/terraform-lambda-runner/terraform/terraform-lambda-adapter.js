const { exec } = require("child_process");
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

exports.handler =  async function(event, context) {
  const customExec = promisify(exec)
  let result, output;
  const username = event.username;
  try {
    await customExec('rm -rf /tmp/*', { stdio: "inherit" })

    const backendConfig = `
      bucket = "${process.env.BUCKET_NAME}"
      key    = "${username}/terraform.tfstate"
      region =  "${process.env.AWS_REGION}"
    `

    const backendConfigPath = path.join('/', 'tmp', 'config.s3.tfbackend');
    fs.writeFileSync(backendConfigPath, backendConfig)

    output = await customExec(`terraform init -reconfigure -backend-config=${backendConfigPath} && terraform apply && terraform output -json > /tmp/hekto.output.json`, { stdio: "inherit", cwd: process.cwd(), env: {
      ...process.env,
      TF_VAR_name: event.name,
      TF_LOG: 'INFO',
    } })
    result = JSON.parse(fs.readFileSync(path.join('/', 'tmp', 'hekto.output.json'), 'utf-8'))
  } catch(e) {
    console.log(e)
    throw e
  }

  return {
    result,
    output
  };
}