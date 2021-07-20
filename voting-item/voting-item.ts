import { Component, Input } from '@angular/core';
import { AlertController, ModalController, NavController } from 'ionic-angular';
import { TranslateService } from '@ngx-translate/core';
import { Device } from '@ionic-native/device';

import { BaseComponent } from '../base-component/base-component';
import { ISociety } from './../../typings/models';
import { IPollModel } from 'bo-interfaces/bin/models/polls.interfaces';

import { ErrService } from '../../providers/err.service';
import { DataService } from '../../providers/data.service';
import { NavService } from '../../providers/nav.service';
import { PopulatedService } from './../../providers/populated.service';
import { UserService } from '../../providers/user.service';
import { getUserUnitsBySocietyId } from './../../utils/units';

@Component({
  selector: 'component-voting-item',
  templateUrl: 'voting-item.html',
})
export class VotingItemComponent extends BaseComponent {
  protected _pollData: IPollModel;
  protected _userCantVote = false;
  protected _hasVoted = false;
  protected _votes: { [optionId: string]: number } = {};
  protected _userVote: string;
  protected _totalVotes: number = 0;
  protected _userId: string;
  protected _isAdmin = false;
  protected _isUsersVote = false;
  protected _showResults = false;

  constructor(
    protected alertCtrl: AlertController,
    protected dataService: DataService,
    protected device: Device,
    protected errService: ErrService,
    protected navCtrl: NavController,
    protected navService: NavService,
    protected modalCtrl: ModalController,
    protected populatedService: PopulatedService,
    protected translate: TranslateService,
    protected userService: UserService,
  ) {
    super();
    this._userId = this.userService.user.get()._id;
  }

  // ----------------------------------------
  // Getters and setters

  @Input()
  protected set poll(val: IPollModel) {
    this.setPoll(val);
    const society: ISociety = this.populatedService.getById('societies', val.societyId);
    this._isAdmin = society != null ? this.userService.isAdmin(society) : false;
  }

  setPoll(poll: IPollModel) {
    this._pollData = poll;
    this._hasVoted = this.hasVoted();
    this.setPollResults();
    this._showResults = this._hasVoted;
  }

  triggerUnitUnassignedPopup() {
    return this.alertCtrl.create({
      message: this.translate.instant('GENERIC_USER_IS_UNASSIGNED_MESSAGE'),
      buttons: ['Ok'],
    }).present();
  }

  hasVoted(): boolean {
    if (this._pollData == null) {
      return false;
    }

    // per-user (or poll.type is null)
    if (this._pollData.type == null || this._pollData.type === 'per-user') {
      const userVoted = this._pollData.votes.find(item => item.userId === this._userId) != null;
      this._isUsersVote = userVoted;
      return userVoted;
    }

    // per-unit
    const user = this.userService.user.get();
    const userUnits = getUserUnitsBySocietyId(
      user,
      this._pollData.societyId,
      this.populatedService,
      true,
    );

    // poll is per-unit & user is un-assigned (disable UI + on click a popup to ping admin)
    if (userUnits == null || userUnits.length === 0) {
      this._userCantVote = true;
      return false;
    }

    const votes = this._pollData.votes || [];
    const householdIds = userUnits != null ? (userUnits[0].residentsList || []).map(user => user.userId) : [];
    const householdVote = votes.find(vote => householdIds.indexOf(vote.userId) > -1);
    this._userVote = householdVote != null ? householdVote.userId : null;

    const userVoted = this._pollData.votes.find(item => item.userId === this._userId) != null;
    this._isUsersVote = userVoted;

    return householdVote != null;
  }

  setPollResults() {
    if (this._pollData == null) {
      return;
    }

    if (this._pollData.votes == null) {
      this._pollData.votes = [];
    }

    // Calculate total votes so far
    this._totalVotes = this._pollData.votes.length;

    // Only continue if user has already voted
    if (!this._hasVoted) {
      return;
    }

    // Calculate vote distribution
    this._userVote = null;
    this._votes = this._pollData.votes.reduce((prev, curr) => {
      if (prev[curr.optionId] == null) {
        prev[curr.optionId] = 0;
      }

      prev[curr.optionId] = prev[curr.optionId] + 1;

      // Check which option user chose
      if (curr.userId === this._userId) {
        this._userVote = curr.optionId;
      }

      return prev;
    }, {});
  }

  toggleView() {
    this._showResults = !this._showResults;
  }

  vote(optionId: string) {
    if (this._userCantVote) {
      return;
    }

    this.addLoading();
    this.dataService.polls
      .vote(this._pollData._id, optionId)
      .then(updatedPoll => this.setPoll(updatedPoll))
      .catch(err => {
        this.errService.handleErr(err, true);
        return this.fetchPoll();
      })
      .then(() => this.removeLoading());
  }

  unVote() {
    if (this._userCantVote) {
      return;
    }

    this.addLoading();
    this.dataService.polls
      .unVote(this._pollData._id)
      .then(updatedPoll => {
        this._userVote = null;
        this.setPoll(updatedPoll);
      })
      .catch(err => {
        this.errService.handleErr(err, true);
        return this.fetchPoll();
      })
      .then(() => this.removeLoading());
  }

  fetchPoll(): Promise<any> {
    return this.dataService.polls.get(this._pollData._id)
      .then(poll => this.setPoll(poll))
      .catch(err => this.errService.handleErr(err));
  }
}
