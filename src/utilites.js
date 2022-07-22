import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import debug from 'debug';
import axiosDebug from 'axios-debug-log';
import Listr from 'listr';
import url from 'url';

axiosDebug({
  request(deb, config) {
    deb(`Request with ${config.headers['content-type']}`);
  },
  response(deb, response) {
    deb(`Response with ${response.headers['content-type']}`, `from ${response.config.url}`);
  },
});

const log = debug('page-loader');

const tags = {
  script: 'src',
  img: 'src',
  link: 'href',
};

export const createFileName = (url) => {
  const parts = url
    .replace('https://', '')
    .replace(/[\W]{1}$/g, '')
    .replace(/[\W]/g, '-');
  return parts;
};

export const checkLocalLink = (link, url) => {
  const originalHost = new URL(url).origin;
  return new URL(link, originalHost).origin === originalHost;
};

export const getFilesDirectoryPath = (url) => `${createFileName(url)}_files`;

const genResourceName = (url) => url.replace(/[^a-zA-Z0-9]/g, '-');

export const getFilename = (resUrl, baseUrl) => {
  const { pathname } = new URL(resUrl, 'https://example.com');
  const filename = pathname
    .split('/')
    .filter((el) => el !== '')
    .join('-');
  return filename === '' ? 'index.html' : `${createFileName(baseUrl)}-${filename}`;
};

export const downloadHtml = (url, htmlPath) => axios.get(url).then((response) => fs.writeFile(htmlPath, response.data, 'utf-8'));

export const getLinksAndChangeHtml = (html, url) => {
  log('parsing html for local links and transforming HTML-page');
  const links = [];
  const baseUrl = createFileName(url);
  const $ = cheerio.load(html);
  Object.keys(tags).map((tag) =>
    $(tag).each((i, el) => {
      const link = $(el).attr(tags[tag]);
      if (link && checkLocalLink(link, url)) {
        $(el).attr(`${tags[tag]}`, `${path.join(getFilesDirectoryPath(url), getFilename(link, baseUrl))}`);
        links.push(link);
      }
    })
  );
  return { links, newHtml: $.html() };
};

export const getAbsoluteUrls = (links, url) => {
  return links.map((link) => new URL(link, url).href);
};

export const downloadResources = (links, resourcesPath, url) => {
  console.log(url);
  log('downloading resources');
  return fs.mkdir(resourcesPath).then(() => {
    const promises = links.map((link) => {
      return {
        title: `Downloading ${link}`,
        task: () =>
          axios({
            method: 'get',
            url: link,
            responseType: 'arraybuffer',
          }).then((data) => {
            return fs.writeFile(path.join(resourcesPath, getFilename(link, url)), data.data);
          }),
      };
    });
    return new Listr(promises, { concurrent: true, exitOnError: false }).run().catch((error) => ({ result: 'error', error }));
  });
};
