import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
} from 'homebridge';

/*
 * IMPORTANT NOTICE
 *
 * One thing you need to take care of is, that you never ever ever import anything directly from the "homebridge" module (or the "hap-nodejs" module).
 * The above import block may seem like, that we do exactly that, but actually those imports are only used for types and interfaces
 * and will disappear once the code is compiled to Javascript.
 * In fact you can check that by running `npm run build` and opening the compiled Javascript file in the `dist` folder.
 * You will notice that the file does not contain a `... = require("homebridge");` statement anywhere in the code.
 *
 * The contents of the above import statement MUST ONLY be used for type annotation or accessing things like CONST ENUMS,
 * which is a special case as they get replaced by the actual value and do not remain as a reference in the compiled code.
 * Meaning normal enums are bad, const enums can be used.
 *
 * You MUST NOT import anything else which remains as a reference in the code, as this will result in
 * a `... = require("homebridge");` to be compiled into the final Javascript code.
 * This typically leads to unexpected behavior at runtime, as in many cases it won't be able to find the module
 * or will import another instance of homebridge causing collisions.
 *
 * To mitigate this the {@link API | Homebridge API} exposes the whole suite of HAP-NodeJS inside the `hap` property
 * of the api object, which can be acquired for example in the initializer function. This reference can be stored
 * like this for example and used to access all exported variables and classes from HAP-NodeJS.
 */
let hap: HAP;

import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import cheerio = require('cheerio');
import qs = require('qs');
import tough = require('tough-cookie');
import axiosCookieJarSupport from 'axios-cookiejar-support';

axiosCookieJarSupport(axios);

/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
  hap = api.hap;
  api.registerAccessory('iSmartGate Light', iSmartGateSwitch);
};

class iSmartGateSwitch implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly name: string;
  private readonly hostname: string;
  private readonly username: string;
  private readonly password: string;
  private webtoken: string;
  private switchOn = false;
  private cookieJar = new tough.CookieJar();

  private readonly switchService: Service;
  private readonly informationService: Service;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.name = config.name;
    this.hostname = config.hostname;
    this.username = config.username;
    this.password = config.password;
    this.webtoken = "";

    this.login();

    this.switchService = new hap.Service.Switch(this.name);
    this.switchService.getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        log.info('Current state of the switch was returned: ' + (this.switchOn? 'ON': 'OFF'));
        callback(undefined, this.switchOn);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.switchOn = value as boolean;
        if (this.switchOn) {
        	this.lightOn();
			log.info('Light On');
        } else {
        	this.lightOff();
			log.info('Light Off');
        }
        
        log.info('Switch state was set to: ' + (this.switchOn? 'ON': 'OFF'));
        callback();
      });

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'iSmartGate')
      .setCharacteristic(hap.Characteristic.Model, 'Pro');

    log.info('Switch finished initializing!');
  }

  async login () {
	const url: string = 'http://' + this.hostname + '/index.php';
    const data = {
		login: this.username,
		pass: this.password,
		'send-login': 'Sign in',
		'sesion-abierta': 1
	};
	const config = {
	        headers: {
	            'Content-Type': 'application/x-www-form-urlencoded'
	        },
	        jar: this.cookieJar,
	        withCredentials: true
	    };
	try {
	    const res = await axios.post(url, qs.stringify(data), config);
	    this.log.info('Login Successful');
	    const getWebToken = await axios.get('http://ismartgate.home/index.php?op=config#light-val', config);
	    const $ = cheerio.load(getWebToken.data)
	    this.webtoken = $('#webtoken').val();
	    this.log.info('Webtoken Identified');
	} catch (err) {
	    console.error(err);
	}
  }

  async lightOn () {
  	const config = {
        jar: this.cookieJar,
        withCredentials: true
    };
  	try {
  		const res = await axios.get('http://ismartgate.home/isg/light.php?op=activate&light=1&webtoken='+this.webtoken, config);
	    	console.log(res.data);
	    	if(res.data == "Restricted Access") {
				this.log("Login token expired, refreshing...");
				this.login();
			}
			else {this.log("Could not connect.", "Check http://" + this.hostname + " to make sure the device is still reachable & no captcha is showing.");}
	    } catch (err) {
	    	console.error(err);
	    }
  }

   async lightOff () {
  	const config = {
        jar: this.cookieJar,
        withCredentials: true
    };
  	try {
  		const res = await axios.get('http://ismartgate.home/isg/light.php?op=activate&light=0&webtoken='+this.webtoken, config);
	    	console.log(res.data);
	    	if(res.data == "Restricted Access") {
				this.log("Login token expired, refreshing...");
				this.login();
			}
			else {this.log("Could not connect.", "Check http://" + this.hostname + " to make sure the device is still reachable & no captcha is showing.");}
	    } catch (err) {
	    	console.error(err);
	    }
  }

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log('Identify!');
  }

  /*
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
  getServices(): Service[] {
    return [
      this.informationService,
      this.switchService,
    ];
  }

}