import { Injectable } from '@angular/core';
import { QueryBuilder, QueryMatch, QueryParam } from '../models/QueryBuilder';
import { Subject } from 'rxjs';
import { NetworkService } from './network.service';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class QueryBuilderService {

  public queryBuilderObject: QueryBuilder;
  public queryBuilderSub = new Subject<QueryBuilder>();
  resultSub = new Subject();
  public resultStore: any;
  searchType: string;

  constructor(private http: HttpClient) { }

  getCurrentObject() {
    if (!this.queryBuilderObject) {
      const savedObject = this.getSavedObject();
      if (savedObject) {
        this.queryBuilderObject = savedObject;
        return {qb: this.queryBuilderObject, empty: false};
      } else {
        this.queryBuilderObject = new QueryBuilder();
        return {qb: this.queryBuilderObject, empty: true};
      }
    } else {
      return {qb: this.queryBuilderObject, empty: false};
    }
  }

  getSavedObject() {
    return JSON.parse(localStorage.getItem('queryBuilderObject'));
  }

  resetObject() {
    localStorage.removeItem('queryBuilderObject');
    this.queryBuilderObject = new QueryBuilder();
    console.log('qbo after reset ->', this.queryBuilderObject);
  }

  getUpdatedObject() {
    return this.queryBuilderSub.asObservable();
  }

  updateQueryMatch(connection, queryMatch) {
    this.queryBuilderObject[connection] = queryMatch;
    this.queryBuilderSub.next(this.queryBuilderObject);
  }

  addProcessParam(process, queryParam) {
    this.queryBuilderObject[process].push(queryParam);
    this.queryBuilderSub.next(this.queryBuilderObject);
  }

  updateProcessParam(process, index, queryParam) {
    this.queryBuilderObject[process][index] = queryParam;
    this.queryBuilderSub.next(this.queryBuilderObject);
  }

  removeProcessParam(process, queryParam) {
    this.queryBuilderObject[process] = this.queryBuilderObject[process]
      .filter(param => param !== queryParam);
    this.queryBuilderSub.next(this.queryBuilderObject);
  }

  submitSearchResults() {
    console.log('QBO IN SUBMIT', this.queryBuilderObject);
    localStorage.setItem('queryBuilderObject', JSON.stringify(this.queryBuilderObject));
  }

  getSearchResults() {
    return this.http.post<any>('https://psnov1.lbl.gov:8082/generix/search', this.queryBuilderObject);
  }

  getObjectMetadata(id) {
    return this.http.get(`https://psnov1.lbl.gov:8082/generix/brick_metadata/${id}`);
  }

  getDataTypes() {
    return this.http.get('https://psnov1.lbl.gov:8082/generix/data_types');
  }

  getDataModels() {
    return this.http.get('https://psnov1.lbl.gov:8082/generix/data_models');
  }

  getSearchType() {
    return this.searchType;
  }

  setSearchType(searchType: string) {
    this.searchType = searchType;
  }


}
