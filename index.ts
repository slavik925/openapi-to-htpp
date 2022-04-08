import fs from "fs-extra";
import SwaggerParser from "@apidevtools/swagger-parser";
import sanitize from "sanitize-filename";
import { OpenAPIV3 } from "openapi-types";

const args = require("minimist")(process.argv.slice(2));
const dir = args["out"];
const inputFilePath = args["file"];

type HTTP_METHOD = "PUT" | "GET" | "POST" | "DELETE";

if (!dir) {
  console.error("Please specify output directory!");
  process.exit(1);
}

if (!inputFilePath) {
  console.error("Please specify file to parse!");
  process.exit(1);
}

fs.emptyDirSync(dir);

const run = async () => {
  try {
    const result = (await SwaggerParser.dereference(
      inputFilePath
    )) as OpenAPIV3.Document;

    for (const path of Object.keys(result.paths)) {
      const dirPath = `${dir}/${path}`
        .replace(/(\{.*\})/g, "")
        .replace(/\/\//g, "/")
        .replace(/\/$/, "");

      const pathItem = result.paths[path] || {};

      fs.ensureDirSync(dirPath);

      for (const operation of Object.keys(pathItem)) {
        const pathItemObject = pathItem[
          operation as keyof typeof pathItem
        ] as OpenAPIV3.PathItemObject;

        if (!pathItemObject.summary) {
          throw new Error("Summary is missing.");
        }

        const summary = sanitize(pathItemObject.summary);

        switch (operation) {
          case "post":
            fs.outputFileSync(
              `${dirPath}/${summary}.http`,
              post(path, pathItem[operation]!)
            );
            break;
          case "get":
            fs.outputFileSync(
              `${dirPath}/${summary}.http`,
              get(path, pathItem[operation]!)
            );
            break;
          case "put":
            fs.outputFileSync(
              `${dirPath}/${summary}.http`,
              put(path, pathItem[operation]!)
            );
            break;
          case "delete":
            fs.outputFileSync(
              `${dirPath}/${summary}.http`,
              del(path, pathItem[operation]!)
            );
            break;
          default: {
            const errorMessage = "Oops, something is not handled?";
            console.error(errorMessage);
            throw new Error(errorMessage);
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();

function post(apiPath: string, postItem: OpenAPIV3.OperationObject) {
  let rsFile = addVariablesAndHeaders("POST", apiPath, postItem);
  rsFile += addBodyParams(postItem);

  return rsFile;
}

function get(apiPath: string, getItem: OpenAPIV3.OperationObject) {
  let rsFile = addVariablesAndHeaders("GET", apiPath, getItem);
  rsFile += addQueryParams(getItem);

  return rsFile;
}

function put(apiPath: string, putItem: OpenAPIV3.OperationObject) {
  let rsFile = addVariablesAndHeaders("PUT", apiPath, putItem);
  rsFile += addBodyParams(putItem);

  return rsFile;
}

function del(apiPath: string, deleteItem: OpenAPIV3.OperationObject) {
  let rsFile = addVariablesAndHeaders("DELETE", apiPath, deleteItem);
  return rsFile;
}

function addBodyParams(item: OpenAPIV3.OperationObject) {
  let rsFile = "";
  const requestBody = item.requestBody as OpenAPIV3.RequestBodyObject;
  if (requestBody) {
    if (requestBody.content["application/json"]) {
      rsFile += "\nContent-Type: application/json";

      const paramsObject = buildBodyParamsRecursive(
        (
          requestBody.content["application/json"]
            ?.schema as OpenAPIV3.BaseSchemaObject
        ).properties!
      );
      rsFile += "\n\n" + JSON.stringify(paramsObject);

      return rsFile;
    }
  }

  return rsFile;
}

function buildBodyParamsRecursive(properties: OpenAPIV3.BaseSchemaObject) {
  const tempParams: OpenAPIV3.BaseSchemaObject = {};
  Object.keys(properties).forEach((p) => {
    const param = p as keyof typeof properties;

    if (properties[param]?.type === "object") {
      tempParams[param] = buildBodyParamsRecursive(properties[param]);
    } else if (properties[param]?.type === "array") {
      if (properties[param].items.type === "object") {
        tempParams[param] = [
          buildBodyParamsRecursive(properties[param].items.properties),
        ];
      } else {
        tempParams[param] = [""];
      }
    } else {
      tempParams[param] = "";
    }
  });

  return tempParams;
}

function addQueryParams(item: OpenAPIV3.OperationObject) {
  let rsFile = "";
  if (item.parameters) {
    const params = (item.parameters as OpenAPIV3.ParameterObject[])
      .filter((param) => param.in === "query")
      .map((param) => [param.name, ""]);

    rsFile += "\nContent-Type: application/x-www-form-urlencoded\n";
    rsFile += "\n" + new URLSearchParams(params).toString();
  }
  return rsFile;
}

function addVariablesAndHeaders(
  method: HTTP_METHOD,
  apiPath: string,
  item: OpenAPIV3.OperationObject
) {
  let apiPathCopy = String(apiPath);
  let rsFile = "";
  apiPathCopy = escapeUrlPathParams(apiPathCopy);

  rsFile += addPathParamVarDefinitions(
    item.parameters as OpenAPIV3.ParameterObject[]
  );
  rsFile += `${method} {{baseUrl}}${apiPathCopy} HTTP/1.1`;
  rsFile += addAuth();
  return rsFile;
}

function addPathParamVarDefinitions(parameters: OpenAPIV3.ParameterObject[]) {
  let definitions = "";
  parameters.forEach((param) => {
    if (param.in === "path") {
      definitions += createFileVariable(param.name, "");
    }
  });
  return definitions;
}

function escapeUrlPathParams(apiPath: string) {
  return apiPath.replace(/\{/g, "{{").replace(/\}/g, "}}");
}

function addAuth() {
  return "\nAuthorization: Bearer {{token}}";
}

function createFileVariable(name: string, value: string) {
  return `@${name} = ${value}\n`;
}
