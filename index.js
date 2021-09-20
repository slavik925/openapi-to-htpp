const fs = require("fs-extra");
const SwaggerParser = require("@apidevtools/swagger-parser");
const sanitize = require("sanitize-filename");
const args = require('minimist')(process.argv.slice(2))

const dir = args['out'];
const inputFilePath = args['file'];

if (!dir) {
  console.error('Please specify output directory!');
  return -1;
}

if (!inputFilePath) {
  console.error('Please specify file to parse!');
  return -1;
}

fs.emptyDirSync(dir);

SwaggerParser.dereference(inputFilePath).then((result) => {
  Object.keys(result.paths).forEach((path) => {
    const dirPath = `${dir}/${path}`
      .replace(/(\{.*\})/g, "")
      .replace(/\/\//g, "/")
      .replace(/\/$/, "");

    const pathItem = result.paths[path];

    fs.ensureDirSync(dirPath);
    Object.keys(pathItem).forEach((operation) => {
      const summary = sanitize(pathItem[operation].summary);

      switch (operation) {
        case "post":
          fs.outputFileSync(
            `${dirPath}/${summary}.http`,
            post(path, pathItem[operation])
          );
          break;
        case "get":
          fs.outputFileSync(
            `${dirPath}/${summary}.http`,
            get(path, pathItem[operation])
          );
          break;
        case "put":
          fs.outputFileSync(
            `${dirPath}/${summary}.http`,
            put(path, pathItem[operation])
          );
          break;
        case "delete":
          fs.outputFileSync(
            `${dirPath}/${summary}.http`,
            del(path, pathItem[operation])
          );
          break;
        default: {
          const errorMessage = "Oops, something is not handled?";
          console.error(errorMessage);
          throw new Error(errorMessage);
        }
      }
    });
  });
});

function post(apiPath, postItem) {
  let rsFile = addVariablesAndHeaders("POST", apiPath, postItem);
  rsFile += addBodyParams(postItem);

  return rsFile;
}

function get(apiPath, getItem) {
  let rsFile = addVariablesAndHeaders("GET", apiPath, getItem);
  rsFile += addQueryParams(getItem);

  return rsFile;
}

function put(apiPath, putItem) {
  let rsFile = addVariablesAndHeaders("PUT", apiPath, putItem);
  rsFile += addBodyParams(putItem);

  return rsFile;
}

function del(apiPath, deleteItem) {
  let rsFile = addVariablesAndHeaders("DELETE", apiPath, deleteItem);
  return rsFile;
}

function addBodyParams(item) {
  let rsFile = "";
  if (item.requestBody) {
    if (item.requestBody.content["application/json"]) {
      rsFile += "\nContent-Type: application/json";

      const paramsObject =
        buildBodyParamsRecursive(item.requestBody.content["application/json"].schema.properties)
      rsFile += "\n\n" + JSON.stringify(paramsObject);

      return rsFile;
    }
  }

  return rsFile;
}

function buildBodyParamsRecursive(properties) {
  const tempParams = {};
  Object.keys(
    properties
  ).forEach((param) => {
    if (properties[param]?.type === 'object') {
      tempParams[param] = buildBodyParamsRecursive(properties[param])
    } else if (properties[param]?.type === "array") {
      if (properties[param].items.type === "object") {
        tempParams[param] = [buildBodyParamsRecursive(properties[param].items.properties)];
      } else {
        tempParams[param] = [''];
      }
    }
    else {
      tempParams[param] = "";
    }
  });

  return tempParams;
}

function addQueryParams(item) {
  let rsFile = "";
  if (item.parameters) {
    const params = item.parameters
      .filter((param) => param.in === "query")
      .map((param) => [param.name, ""]);

    rsFile += "\nContent-Type: application/x-www-form-urlencoded\n";
    rsFile += "\n" + new URLSearchParams(params).toString();
  }
  return rsFile;
}

function addVariablesAndHeaders(method, apiPath, item) {
  let apiPathCopy = String(apiPath);
  let rsFile = "";
  apiPathCopy = escapeUrlPathParams(apiPathCopy);

  rsFile += addPathParamVarDefinitions(item.parameters);
  rsFile += `${method} {{baseUrl}}${apiPathCopy} HTTP/1.1`;
  rsFile += addAuth();
  return rsFile;
}

function addPathParamVarDefinitions(parameters) {
  let definitions = "";
  parameters.forEach((param) => {
    if (param.in === "path") {
      definitions += createFileVariable(param.name, "");
    }
  });
  return definitions;
}

function escapeUrlPathParams(apiPath) {
  return apiPath.replace(/\{/g, "{{").replace(/\}/g, "}}");
}

function addAuth() {
  return "\nAuthorization: Bearer {{token}}";
}

function createFileVariable(name, value) {
  return `@${name} = ${value}\n`;
}
