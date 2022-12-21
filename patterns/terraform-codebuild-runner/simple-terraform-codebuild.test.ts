import { cdkSpec as cloud, createTestApp, ForceEphemeralResources } from "@hekto/cloud-spec-aws-cdk";
import { aws_s3, aws_codebuild, Aspects } from "aws-cdk-lib";
import { CodeBuildClient, StartBuildCommand, Build, BatchGetBuildsCommand } from "@aws-sdk/client-codebuild";
import path from "path";

const codeBuildClient = new CodeBuildClient({});

const testApp = createTestApp({
  creator: (stack, outputs) => {
    const bucket = new aws_s3.Bucket(stack, "state-bucket");

    const project = new aws_codebuild.Project(stack, "project", {
      buildSpec: aws_codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          build: {
            commands: [
              "node /var/task/terraform-adapter.js",
            ],
          },
        },
      }),
      environment: {
        buildImage: aws_codebuild.LinuxBuildImage.fromAsset(stack, "image", {
          directory: path.join(__dirname, 'terraform'),
        }),
      },
    });

    bucket.grantReadWrite(project);

    Aspects.of(stack).add(new ForceEphemeralResources());

    outputs({
      "bucket": bucket.bucketName,
      "bucketArn": bucket.bucketArn,
      "projectArn": project.projectArn,
    })
  },
})

describe("terraform codebuild runner", () => {
  cloud.setup({
    testApp
  });

  cloud.it("succeeds", async (outputs) => {
    const { projectArn } = outputs

    const result = await codeBuildClient.send(new StartBuildCommand({
      projectName: projectArn,
      environmentVariablesOverride: [
        {
          name: "username",
          value: "foo",
        },
        {
          name: "name",
          value: "JohnDoe",
        },
      ],
    }))

    if (!result.build) {
      throw new Error("no build")
    }

    if (!result.build.id) {
      throw new Error("no build id")
    }

    let build: Build | undefined = undefined
    build = result.build

    let count = 0;
    while (build.buildComplete === false) {
      const builds = await codeBuildClient.send(new BatchGetBuildsCommand({
        ids: [result.build.id],
      }))

      count += 1

      if (!builds.builds) {
        throw new Error("no builds")
      }

      build = builds.builds?.[0]

      if (!build) {
        throw new Error("no build")
      }

      console.log({
        buildStatus: build.buildStatus,
        buildComplete: build.buildComplete,
        currentPhase: build.currentPhase,
        count,
      })
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

  }, 60_000);
});