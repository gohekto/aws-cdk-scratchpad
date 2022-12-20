FROM public.ecr.aws/lambda/nodejs:16

RUN yum -y upgrade        \
  && yum -y install unzip \
  && yum clean all && rm -rf /var/cache/yum

# Install Terraform
ENV DEFAULT_TERRAFORM_VERSION="1.3.5"
RUN AVAILABLE_TERRAFORM_VERSIONS="1.2.0 ${DEFAULT_TERRAFORM_VERSION}" && set -o pipefail && \
    for VERSION in ${AVAILABLE_TERRAFORM_VERSIONS}; do curl -LOk https://releases.hashicorp.com/terraform/${VERSION}/terraform_${VERSION}_linux_amd64.zip && \
    mkdir -p /usr/local/bin/tf/versions/${VERSION} && \
    unzip terraform_${VERSION}_linux_amd64.zip -d /usr/local/bin/tf/versions/${VERSION} && \
    chmod +x chmod +x /usr/local/bin/terraform && \
    ln -s /usr/local/bin/tf/versions/${VERSION}/terraform /usr/local/bin/terraform${VERSION};rm terraform_${VERSION}_linux_amd64.zip ; done

RUN mkdir -p /usr/local/bin
RUN ln -s /usr/local/bin/tf/versions/${DEFAULT_TERRAFORM_VERSION}/terraform /usr/local/bin/terraform

RUN mkdir -p /usr/local/.terraform.d/plugin-cache
RUN mkdir -p /usr/share/terraform/providers
ENV TF_PLUGIN_CACHE_DIR="/usr/local/.terraform.d/plugin-cache"
ENV TF_CLI_CONFIG_FILE="/usr/local/.terraform.d/cli.tfrc"
ENV TF_DATA_DIR="/tmp/.terraform"
ENV TF_IN_AUTOMATION="true"
ENV TF_CLI_ARGS_apply="-auto-approve -input=false"
ENV TF_LOG="TRACE"

COPY terraform-lambda-adapter.js  ${LAMBDA_TASK_ROOT}
COPY main.tf ${LAMBDA_TASK_ROOT}
COPY cli.tfrc /usr/local/.terraform.d/cli.tfrc

RUN cd ${LAMBDA_TASK_ROOT} && terraform init -input=false
COPY backend.tf ${LAMBDA_TASK_ROOT}

# Set the CMD to your handler (could also be done as a parameter override outside of the Dockerfile)
CMD [ "terraform-lambda-adapter.handler" ]