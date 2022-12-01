import { Construct } from "constructs";
import { Role, Policy, ArnPrincipal, SessionTagsPrincipal } from "aws-cdk-lib/aws-iam";
import * as iam from "cdk-iam-floyd";

export interface TokenVendingMachineRoleConfig {
  readonly principalRoleArn: string;
  readonly policyStatements: iam.PolicyStatement[]
}

export class TokenVendingMachineRole extends Construct {
  public readonly resource: Role;
  private readonly policyStatements: iam.PolicyStatement[] = [];

  constructor(scope: Construct, id: string, config: TokenVendingMachineRoleConfig) {
    super(scope, id);

    const { principalRoleArn } = config;
    this.policyStatements = config.policyStatements;

    const name = `token-vending-machine-${this.node.addr}`.substring(0, 32);

    const tvmRole = new Role(this, "token-vending-machine", {
      roleName: name,
      assumedBy: new SessionTagsPrincipal(new ArnPrincipal(principalRoleArn)),
    });

    tvmRole.attachInlinePolicy(new Policy(this, "token-vending-machine-policy", {
      statements: this.policyStatements
    }));

    this.resource = tvmRole;
  }
}
