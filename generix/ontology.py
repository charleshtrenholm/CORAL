from elasticsearch import Elasticsearch
import os
from . import services

_IMPORT_DIR = 'data/import/'
_ES_OTERM_INDEX_PREFIX = 'generix-ont-'
_ES_OTERM_TYPE = 'oterm'

_ONTOLOGY_CONFIG = {
    'version': 1,
    'ontologies': {
        'units': {
            'name': 'Units',
            'file_name': 'unit_standalone.obo'
        },
        'dtype': {
            'name': 'Data types',
            'file_name': 'data_type_ontology.obo'
        },
        'enigma': {
            'name': 'ENIGMA metadata',
            'file_name': 'enigma_specific_ontology.obo'
        },
        'env': {
            'name': 'ENV',
            'file_name': 'env.obo'
        },
        'context_measurement': {
            'name': 'context_measurement',
            'file_name': 'context_measurement_ontology.obo'
        },
        'continent': {
            'name': 'continent',
            'file_name': 'continent.obo'
        },
        'country': {
            'name': 'country',
            'file_name': 'country.obo'
        },
        'mixs': {
            'name': 'mixs',
            'file_name': 'mixs.obo'
        },
        'process_ontology': {
            'name': 'process_ontology',
            'file_name': 'process_ontology.obo'
        }

        # data/import/ncbitaxon.obo
    }
}


class OntologyService:
    def __init__(self, es_client):
        self.__es_client = es_client

    def _upload_ontologies(self):
        for ont_id, ont in _ONTOLOGY_CONFIG['ontologies'].items():
            print('Doing ontology: ' + ont_id)
            self._upload_ontology(ont_id, ont)

    def _upload_ontology(self, ont_id, ont):
        index_name = self._index_name(ont_id)
        self._drop_index(index_name)
        self._create_index(index_name)

        terms = self._load_terms(ont_id, ont['file_name'])
        self._index_terms(ont_id, terms)

    def _index_name(self, ont_id):
        return _ES_OTERM_INDEX_PREFIX + ont_id

    def _index_terms(self, ont_id, terms):
        index_name = self._index_name(ont_id)
        for _, term in terms.items():
            all_parent_ids = {}
            self._collect_all_parent_ids(term, all_parent_ids)
            doc = {
                'ontology_id': ont_id,
                'term_id': term.term_id,
                'term_name': term.term_name,
                'term_name_prefix': term.term_name,
                'parent_term_ids': term.parent_ids,
                'parent_path_term_ids': list(all_parent_ids.keys())
            }
            self.__es_client.index(
                index=index_name, doc_type=_ES_OTERM_TYPE, body=doc)

    def _collect_all_parent_ids(self, term, all_parent_ids):
        for pt in term._parent_terms:
            all_parent_ids[pt.term_id] = pt
            self._collect_all_parent_ids(pt, all_parent_ids)

    def _load_terms(self, ont_id, file_name):
        STATE_NONE = 0
        STATE_TERM_FOUND = 1

        state = STATE_NONE
        terms = {}

        term_id = None
        term_name = None
        term_aliases = []
        term_parent_ids = []

        root_term = None
        with open(_IMPORT_DIR + file_name, 'r') as f:
            for line in f:
                line = line.strip()
                if state == STATE_NONE:
                    if line.startswith('[Term]'):
                        term_id = None
                        term_name = None
                        term_aliases = []
                        term_parent_ids = []
                        state = STATE_TERM_FOUND

                elif state == STATE_TERM_FOUND:
                    if line.startswith('id:'):
                        term_id = line[len('id:'):].strip()
                    elif line.startswith('name:'):
                        term_name = line[len('name:'):].strip()
                    elif line.startswith('is_a:'):
                        parent_id = line[len('is_a:'):].strip().split(' ')[
                            0].strip()
                        term_parent_ids.append(parent_id)
                    elif line == '':
                        term = Term(self, ont_id, term_id,
                                    term_name, term_parent_ids)
                        terms[term.term_id] = term
                        if root_term is None:
                            root_term = term
                        state = STATE_NONE

        for _, term in terms.items():
            term._update_parents(terms)

        return terms

    def _drop_index(self, index_name):
        try:
            self.__es_client.indices.delete(index=index_name)
        except:
            pass

    def _create_index(self, index_name):
        settings = {
            "settings": {
                "analysis": {
                    "analyzer": {
                        "keyword": {
                            "type": "custom",
                            "tokenizer": "keyword"
                        }
                    }
                }
            },
            "mappings": {
                _ES_OTERM_TYPE: {
                    "properties": {
                        "term_id": {
                            "type": "text",
                            "analyzer": "keyword"
                        },
                        "parent_term_ids": {
                            "type": "text",
                            "analyzer": "keyword"
                        },
                        "parent_path_term_ids": {
                            "type": "text",
                            "analyzer": "keyword"
                        },
                        "term_name": {
                            "type": "text",
                            "analyzer": "keyword"
                        },
                        "term_name_prefix": {
                            "type": "text",
                            "analyzer": "standard"
                        }
                    }
                }
            }
        }

        self.__es_client.indices.create(index=index_name, body=settings)

    def search(self, index_name, query):
        return self.__es_client.search(index=index_name, body=query)

    @property
    def ont_units(self):
        return Ontology(self, 'units')

    @property
    def ont_data_types(self):
        return Ontology(self, 'dtypes')

    @property
    def ont_enigma(self):
        return Ontology(self, 'enigma')

    @property
    def ont_env(self):
        return Ontology(self, 'env')

    @property
    def ont_all(self):
        return Ontology(self, 'all', ontologies_all=True)


class Ontology:
    def __init__(self, ontology_service, ontology_id, ontologies_all=False):
        self.__ontology_service = ontology_service
        self.__index_name = _ES_OTERM_INDEX_PREFIX
        if ontologies_all:
            self.__index_name += '*'
        else:
            self.__index_name += ontology_id

    def _find_terms(self, query, size=100):
        query['size'] = size

        terms = []
        result_set = self.__ontology_service.search(self.__index_name, query)
        for hit in result_set['hits']['hits']:
            data = hit["_source"]
            term = Term(self.__ontology_service,
                        data['ontology_id'], data['term_id'],
                        data['term_name'], data['parent_term_ids'], data['parent_path_term_ids'],)
            terms.append(term)
        return terms

    def _find_term(self, query):
        terms = self._find_terms(query)
        return terms[0] if len(terms) > 0 else None

    def _find_terms_hash(self, query):
        terms_hash = {}
        terms = self._find_terms(query)
        for term in terms:
            terms_hash[term.term_name] = term
        return terms_hash

    def find_id(self, term_id):
        query = {
            "query": {
                "terms": {
                    "term_id": [
                        term_id
                    ]
                }
            }
        }
        return self._find_term(query)

    def find_ids(self, term_ids, size=100):
        query = {
            "query": {
                "terms": {
                    "term_id": term_ids
                }
            }
        }
        return TermCollection(self._find_terms(query, size))

    def find_name(self, term_name):
        query = {
            "query": {
                "terms": {
                    "term_name": [
                        term_name
                    ]
                }
            }
        }
        return self._find_term(query)

    def find_name_prefix(self, term_name_prefix):
        query = {
            "query": {
                "prefix": {
                    "term_name_prefix": term_name_prefix.lower()
                }
            }
        }
        return TermCollection(self._find_terms(query))

    def find_parent_ids(self, parent_term_ids, size=100):
        query = {
            "query": {
                "terms": {
                    "parent_term_ids": parent_term_ids
                }
            }
        }
        return TermCollection(self._find_terms(query, size))

    def find_parent_path_ids(self, parent_term_ids, size=100):
        query = {
            "query": {
                "terms": {
                    "parent_path_term_ids": parent_term_ids
                }
            }
        }
        return TermCollection(self._find_terms(query, size))

    def find_ids_hash(self, term_ids):
        query = {
            "query": {
                "terms": {
                    "term_id": term_ids
                }
            }
        }
        return self._find_terms_hash(query)

    def find_names_hash(self, term_names):
        query = {
            "query": {
                "terms": {
                    "term_name": term_names
                }
            }
        }
        return self._find_terms_hash(query)


class TermCollection:
    def __init__(self, terms):
        self.__terms = terms
        self.__inflate_terms()

    def __inflate_terms(self):
        for term in self.__terms:
            name = 'TERM_' + '_'.join(term.term_name.split(' '))
            self.__dict__[name] = term

    @property
    def terms(self):
        return self.__terms

    @property
    def size(self):
        return len(self.__terms)

    def print(self):
        print('---------- ')
        print(' %s terms' % len(self.terms))
        print('---------- ')
        for term in self.terms:
            print(term)


class Term:
    def __init__(self, ontology_service,  ontology_id, term_id, term_name, parent_ids, parent_path_ids=None):
        self.__ontology_service = ontology_service
        self.__ontology_id = ontology_id
        self.__term_id = term_id
        self.__term_name = term_name
        self.__parent_ids = parent_ids
        self.__parent_path_ids = parent_path_ids
        self.__parent_terms = []
        self.__validator = 'protein_sequence'

    def __str__(self):
        return '%s[%s] = %s  parents:%s' % (self.__ontology_id, self.__term_id, self.__term_name, self.__parent_ids)

    def validate_value(self, val):
        if self.__validator is None:
            return True

        validator = services.term_validator.validator(
            self.__validator)
        if validator is None:
            return True

        return validator(val)

    @property
    def ontology_id(self):
        return self.__ontology_id

    @property
    def term_id(self):
        return self.__term_id

    @property
    def term_name(self):
        return self.__term_name

    @property
    def parent_ids(self):
        return self.__parent_ids

    @property
    def parent_path_ids(self):
        return self.__parent_path_ids

    @property
    def _parent_terms(self):
        return self.__parent_terms

    def load_parents(self):
        ont = Ontology(self.__ontology_service, self.__ontology_id)
        return ont.find_ids_hash(self.__parent_ids)

    def load_children(self):
        ont = Ontology(self.__ontology_service, self.__ontology_id)
        return ont.find_parent_ids([self.term_id])

    def _update_parents(self, terms):
        self.__parent_terms = []
        for pid in self.__parent_ids:
            term = terms[pid]
            self.__parent_terms.append(term)
