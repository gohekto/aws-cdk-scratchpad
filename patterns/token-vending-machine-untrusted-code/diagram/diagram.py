from diagrams import Cluster, Diagram, Edge
from diagrams.aws.compute import Lambda
from diagrams.aws.security import IAMAWSSts, IAMRole
from diagrams.aws.storage import S3
from diagrams.aws.database import Dynamodb

with Diagram("Token Vending Machine", show=False):

    with Cluster("Lambda"):
      dispatcher = Lambda("dispatcher")
      processor = Lambda("tenant processor")

    with Cluster("Shared Resources"):
        store = S3("assets")
        dw = Dynamodb("inventory")

    with Cluster("Auth"):
      sts = IAMAWSSts("session role")

    dispatcher >> Edge(label="scoped session policy") >> sts >> Edge(style="dotted") >> dispatcher
    dispatcher >> Edge(label="injects session policy") >> processor
    processor >> Edge(label="scoped") >> dw >> processor
    processor >> store >> processor