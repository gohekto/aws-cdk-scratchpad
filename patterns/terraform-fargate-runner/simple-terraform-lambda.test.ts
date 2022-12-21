import { cdkSpec as cloud, createTestApp, ForceEphemeralResources } from "@hekto/cloud-spec-aws-cdk";
import { aws_s3, aws_ecs, aws_iam, Aspects } from "aws-cdk-lib";
import { ECSClient, RunTaskCommand, DescribeTasksCommand, DescribeTasksCommandOutput } from "@aws-sdk/client-ecs";
import path from "path";

const ecsClient = new ECSClient({});

const testApp = createTestApp({
  creator: (stack, outputs) => {
    const bucket = new aws_s3.Bucket(stack, "state-bucket");

    const definition = new aws_ecs.FargateTaskDefinition(stack, "definition", {
      memoryLimitMiB: 2048,
      cpu: 1024,
      runtimePlatform: {
        operatingSystemFamily: aws_ecs.OperatingSystemFamily.LINUX,
      },
    });

    definition.addContainer("container", {
      image: aws_ecs.ContainerImage.fromAsset(path.join(__dirname, 'terraform')),
      logging: aws_ecs.LogDrivers.awsLogs({
        streamPrefix: "testing",
      }),
      environment: {
        BUCKET_NAME: bucket.bucketName,
      },
      memoryLimitMiB: 2048,
      cpu: 1024,
    });

    const cluster = new aws_ecs.Cluster(stack, "testing", {
    });

    definition.addToTaskRolePolicy(new aws_iam.PolicyStatement({
      actions: [
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:GetAuthorizationToken"
      ],
      resources: ["*"],
    }));

    definition.addToTaskRolePolicy(new aws_iam.PolicyStatement({
      actions: [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
      ],
      resources: ["*"],
    }));

    bucket.grantReadWrite(definition.taskRole);

    Aspects.of(stack).add(new ForceEphemeralResources());

    outputs({
      "bucket": bucket.bucketName,
      "bucketArn": bucket.bucketArn,
      "taskDefinition": definition.taskDefinitionArn,
      "cluster": cluster.clusterName,
      "privateSubnets": cluster.vpc.privateSubnets[0].subnetId,
    })
  },
})

describe("terraform lambda runner", () => {
  cloud.setup({
    testApp,
    forceDestroy: true,
  });

  cloud.it("succeeds", async (outputs) => {
    const { taskDefinition, cluster, privateSubnets } = outputs

    const result = await ecsClient.send(new RunTaskCommand({
      cluster,
      taskDefinition,
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: [privateSubnets],
          assignPublicIp: "DISABLED",
        },
      },
      launchType: "FARGATE",
      overrides: {
        containerOverrides: [
          {
            name: "container",
            environment: [
              {
                name: "USERNAME",
                value: "foo",
              },
              {
                name: "NAME",
                value: "JohnDoe",
              },
            ],
          },
        ],
      },
    }))

    if (result.tasks === undefined || result.tasks.length === 0) {
      throw new Error("No tasks were started");
    }

    const task = result.tasks[0];
    let describeResult: DescribeTasksCommandOutput | undefined = undefined;
    let status = result.tasks[0].lastStatus;
    let count = 0;

    while (status !== "STOPPED") {
      await new Promise(resolve => setTimeout(resolve, 1000));
      count += 1;
      describeResult = await ecsClient.send(new DescribeTasksCommand({
        cluster,
        tasks: [task.taskArn!],
      }));
      if (describeResult.tasks === undefined || describeResult.tasks.length === 0) {
        throw new Error("No tasks were found");
      }
      status = describeResult.tasks[0].lastStatus;
    }

    if (describeResult === undefined || describeResult.tasks === undefined || describeResult.tasks.length === 0) {
      throw new Error("No tasks were found");
    }
    const lastResultTask = describeResult.tasks[0];
    if (lastResultTask === undefined) {
      throw new Error("No tasks were found");
    }

    expect(lastResultTask.stopCode).toEqual('EssentialContainerExited');
    expect(lastResultTask.stoppedReason).toEqual('Essential container in task exited');

    console.log(`seconds it took to start pulling image: ${(lastResultTask.pullStartedAt!.getTime() - lastResultTask.createdAt!.getTime()) / 1000}`);
    console.log(`seconds it took to pull image: ${(lastResultTask.pullStoppedAt!.getTime() - lastResultTask.pullStartedAt!.getTime()) / 1000}`);
    console.log(`seconds it took to start: ${(lastResultTask.startedAt!.getTime() - lastResultTask.pullStoppedAt!.getTime()) / 1000}`);
    console.log(`seconds it took to run: ${(lastResultTask.stoppingAt!.getTime() - lastResultTask.startedAt!.getTime()) / 1000}`);
    console.log(`seconds it took to stop: ${(lastResultTask.stoppedAt!.getTime() - lastResultTask.stoppingAt!.getTime()) / 1000}`);
    console.log(`seconds it took to complete in total: ${(lastResultTask.stoppedAt!.getTime() - lastResultTask.createdAt!.getTime()) / 1000}`);
  }, 120_000);
});