terraform {
  required_providers {
    null = {
      source = "registry.terraform.io/hashicorp/null"
      version = "3.2.1"
    }
  }
}

provider "null" {
}

variable "name" {
  type = string
  description = "provide a name"
}

output "greeting" {
  value = "${var.name} is a great person"
}

resource "null_resource" "main" {
  triggers = {
    "name" = var.name
  }
}
