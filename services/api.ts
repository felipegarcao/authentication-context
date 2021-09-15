import axios, { AxiosError } from "axios";
import { parseCookies, setCookie } from "nookies";
import { signOut } from "../contexts/AuthContext";

let isRefreshing = false;
let failedRequestsQueue = [];

export function setupAPIClient(ctx = undefined){
  let cookies = parseCookies(ctx);

  const api = axios.create({
    baseURL: "http://localhost:3333/", // é preciso estar rodando a aplicação do auth backend feita em node.
    headers: {
      Authorization: `Bearer ${cookies["nextauth.token"]}`,
    },
  });
  
  api.interceptors.response.use(
    (response) => {
      return response;
    },
    (error: AxiosError) => {
      if (error.response.status === 401) {
        if (error.response.data?.code === "token.expired") {
          // Renovar Token
          cookies = parseCookies(ctx);
  
          const { "nextauth.refreshToken": refreshToken } = cookies;
          const originalConfig = error.config;
  
          if (!isRefreshing) {
            isRefreshing = true;
  
            api
              .post("/refresh", {
                refreshToken,
              })
              .then((response) => {
                const { token } = response.data;
  
                setCookie(ctx, "nextauth.token", token, {
                  maxAge: 60 * 60 * 24 * 30, // 30 days -  o dando de tempo que ele vai ficar salva no meu navegador
                  path: "/", // qual endereço terá acesso aos cookies, quando eu coloco barra quero dizer que qualquer endereço terá acesso
                });
  
                setCookie(
                  ctx,
                  "nextauth.refreshToken",
                  response.data.refreshToken,
                  {
                    maxAge: 60 * 60 * 24 * 30,
                    path: "/",
                  }
                );
  
                api.defaults.headers["Authorization"] = `Bearer ${token}`;
  
                failedRequestsQueue.forEach((request) =>
                  request.onSuccess(token)
                );
                failedRequestsQueue = [];
              })
              .catch((err) => {
                failedRequestsQueue.forEach((request) => request.onFailure(err));
                failedRequestsQueue = [];
  
                if (process.browser) {
                  signOut()
                }
              })
              .finally(() => {
                isRefreshing = false;
              });
          }
  
          return new Promise((resolve, reject) => {
            failedRequestsQueue.push({
              onSuccess: (token: string) => {
                originalConfig.headers["Authorization"] = `Bearer ${token}`;
  
                resolve(api(originalConfig));
              },
              onFailure: (err: AxiosError) => {
                reject(err);
              },
            });
          });
        } else {
          // Deslogar Usuário
          if (process.browser) {
            signOut()
          }
        }
      }
      return Promise.reject(error);
    }
  );

  return api;
}
