
import { writeFile } from 'node:fs/promises';

let token='v5sRS_P_2037865620460146710s2039217396765571746'
let project_key = 'RS_P_2037865620460146710'
let api_key = 'RS5:d5765fc948f74b2d7ef3b90f78a7f790'
let key='a-rz--cricket--bcci--iplt20--2026-ZGwl'
let matchkey='a-rz--cricket--lJ2031799077993340929'

let options = {
    method: 'POST',
    headers: {
    'rs-token': token
  },
    body: JSON.stringify({
    api_key: `${api_key}`
    })
    }
// iplt20_2022

var options2 = {
  method: 'GET',
  headers: {
    'rs-token': token
  }
}

    async function getData() {
        const ap=await fetch(`https://api.sports.roanuz.com/v5/core/${project_key}/auth/`,options);
        const res=await ap.json();
        //@ts-ignore
        console.log(res);
    }
let page='a_1_1'
    async function getData2() {
        const ap=await fetch(`https://api.sports.roanuz.com/v5/cricket/${project_key}/match/${matchkey}/over-summary/${page}/`,options2);
        const res=await ap.json();

      const fileName = `nextover-data-${Date.now()}.json`;
      await writeFile(fileName, JSON.stringify(res, null, 2), 'utf-8');

      console.log(`Saved API response to ${fileName}`);
    }

    async function getData3() {
        const ap=await fetch(`https://api.sports.roanuz.com/v5/cricket/${project_key}/match/${matchkey}/ball-by-ball/`,options2);
        const res=await ap.json();

      const fileName = `ball-data-${Date.now()}.json`;
      await writeFile(fileName, JSON.stringify(res, null, 2), 'utf-8');

      console.log(`Saved API response to ${fileName}`);
    }
    async function gettournament() {
        const ap=await fetch(`https://api.sports.roanuz.com/v5/cricket/${project_key}/featured-tournaments/`,options2);
        const res=await ap.json();

      const fileName = `iplkeilava-data-${Date.now()}.json`;
      await writeFile(fileName, JSON.stringify(res, null, 2), 'utf-8');

      console.log(`Saved API response to ${fileName}`);
    }


    getData3();

