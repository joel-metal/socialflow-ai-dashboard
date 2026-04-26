variable "env"        { type = string }
variable "vpc_id"     { type = string }
variable "subnet_ids" { type = list(string) }
variable "node_type"  { type = string; default = "cache.t3.micro" }
variable "app_sg_id"  { type = string }
