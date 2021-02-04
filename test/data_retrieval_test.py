import unittest
import os
import json
import warnings
import requests
import urllib3
import jwt
import datetime
import time
import base64
import pprint
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_OAEP

from generix.dataprovider import DataProvider

class dataRetrievalTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # filter out resource warnings and "unclosed connection" warning
        warnings.simplefilter("ignore", ResourceWarning)
        warnings.simplefilter("ignore", DeprecationWarning)
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        # get constants defined in var/config.json
        cls.dp = DataProvider()
        cls.cns = cls.dp._get_constants()
    
        # default url for web services
        host = "localhost"
        port = cls.cns['_WEB_SERVICE']['port']
        https = cls.cns['_WEB_SERVICE']['https']
        if https:
            cls.url = "https://"+host+':'+str(port)+'/generix/'
        else:
            cls.url = "http://"+host+':'+str(port)+'/generix/'

    def get_key_data_public(self):
        return self.cns['_AUTH_PUBLIC']

    def get_key_public(self):
        data = self.get_key_data_public()
        public_key = RSA.importKey(data)
        return public_key

    def get_authorized_headers(self):
        now = datetime.datetime.now(tz=datetime.timezone.utc)
        payload = {
	    'exp': now + datetime.timedelta(days=0, seconds=0, microseconds=0, milliseconds=0, minutes=120),
	    'iat': now
	}
        
        public_key = self.get_key_public()
        encryptor = PKCS1_OAEP.new(public_key)
        secret = encryptor.encrypt(str(int(now.timestamp())).encode('utf-8'))
        b64 = base64.b64encode(secret)

        new_jwt = jwt.encode(payload, 'data clearinghouse', headers={'secret':b64.decode('utf-8')}, algorithm='HS256')

        headers = {'Authorization': 'JwToken' + ' ' + new_jwt.decode(), 'content-type': 'application/json'}
        return headers
    
        
    # get TSV list of all strains
    def test_get_strains_TSV(self):
        headers = self.get_authorized_headers()
        
        # this method is @auth_ro_required, so should work
        query = {'format': 'TSV',
                 'queryMatch': {'category': 'SDT_',
                                'dataModel': 'Strain',
                                'dataType': 'Strain',
                                'params': []}}
        r = requests.post(self.url+'search', headers=headers, json=query, verify=False)
        # print (r.text)
        self.assertEqual(r.status_code,200)

    # get JSON list of all strains
    def test_get_strains_JSON(self):
        headers = self.get_authorized_headers()
        
        # this method is @auth_ro_required, so should work
        query = {'format': 'JSON',
                 'queryMatch': {'category': 'SDT_',
                                'dataModel': 'Strain',
                                'dataType': 'Strain',
                                'params': []}}
        r = requests.post(self.url+'search', headers=headers, json=query, verify=False)
        self.assertEqual(r.status_code,200)


    # get a brick as JSON
    def test_get_brick_JSON(self):
        headers = self.get_authorized_headers()
        
        # this method is @auth_ro_required, so should work
        query = {}
        r = requests.post(self.url+'brick/Brick0000001', headers=headers, json=query, verify=False)
        # print (r.text)
        self.assertEqual(r.status_code,200)

    # get a brick as CSV
    def test_get_brick_CSV(self):
        headers = self.get_authorized_headers()
        
        # this method is @auth_ro_required, so should work
        query = {'format': 'TSV'}
        r = requests.post(self.url+'brick/Brick0000001', headers=headers, json=query, verify=False)
        # print (r.text)
        self.assertEqual(r.status_code,200)

    # get a brick, filtered for graphing
    def test_get_brick_filtered(self):
        headers = self.get_authorized_headers()
        
        # this method is @auth_ro_required, so should work
        query = {"constant":{"2/1":5,"2/4":2,"3":1}, "variable":["1/1", "2/2", "2/3"]}
        r = requests.post(self.url+'filter_brick/Brick0000003', headers=headers, json=query, verify=False)
        # print (r.text)
        self.assertEqual(r.status_code,200)
        

    # get a brick, filtered for graphing
    def test_get_brick_filtered_2(self):
        headers = self.get_authorized_headers()
        
        # this method is @auth_ro_required, so should work
        query = {"constant":{"1":11,"4":1}, "variable":["2", "3"]}
        r = requests.post(self.url+'filter_brick/Brick0000004', headers=headers, json=query, verify=False)
        print (r.text)
        self.assertEqual(r.status_code,200)
        

    # fail due to index too high
    def test_get_brick_filtered_3(self):
        headers = self.get_authorized_headers()
        
        # this method is @auth_ro_required, so should work
        query = {"constant":{"1":11,"4":1}, "variable":["2", "7"]}
        r = requests.post(self.url+'filter_brick/Brick0000004', headers=headers, json=query, verify=False)
        # print (r.text)
        self.assertEqual(r.status_code,200)

    # get brick metadata, limit variables for plotting
    def test_get_brick_plot_metadata(self):
        headers = self.get_authorized_headers()

        # this method is @auth_ro_required, so should work
        # Brick0000015 has high number of variables in one dimension, so should be good test case
        print('URL =>', self.url+'brick_plot_metadata/Brick0000015/100')
        r = requests.get(self.url+'brick_plot_metadata/Brick0000015/100', headers=headers, verify=False)
        # self.assertEqual(r.status_code, 200)
        json_response = json.loads(r.text)
        # print('headers =>', headers)
        print('json response ->>>', json_response)
        dim_length_0 = json_response['dim_context'][0]['typed_values'][0]['values']['values'] # size is 25588, so should be truncated at 100
        dim_length_1 = json_response['dim_context'][1]['typed_values'][0]['values']['values'] # size is 42, so should not be truncated

        self.assertEqual(dim_length_0, 100)
        self.assertEqual(dim_length_1, 42)
