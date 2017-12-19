var Client = require("instagram-private-api").V1;
var exceptions = require("instagram-private-api").V1.Exceptions;
var _ = require("lodash");
var Promise = require("bluebird");
var followProvider = require("./follow-provider");
var genderService = require("../gender/gender-service");

exports.followEndLike = async (req, res, next) => {
    try {
        const session = req.session;
        const accountId = await session.getAccountId();
        const amountFollow = req.body.amountFollow;

        let feed;
        let amountFollowed = 0;
        let index = 0;

        switch (req.body.by) {
            case "location":
                feed = new Client.Feed.LocationMedia(session, req.body.locationId, 1000);
                break;

            case "hashtag":
                feed = new Client.Feed.TaggedMedia(session, req.body.tag, 1000);
                break;

            default:
                res.status(500).send({ message: "Invalid by." });
                return;
                break;
        }

        let data = await feed.get();
        follow(session, res, feed, data, index, accountId, amountFollowed, amountFollow);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

exports.fixFollowBugs = async (req, res, next) => {
    try {
        const session = req.session;
        const accountId = await session.getAccountId();
        const follows = await followProvider.getFollowing(accountId);

        for (let i = 0; i < follows.length; i++) {
            const e = follows[i];
            const rel = await Client.Relationship.get(session, e.userFollowerId);

            console.log("");
            console.log(e.userFollowerId);

            if (!rel.params.following) {
                await followProvider.delete(accountId, e.userFollowerId);
                console.log("Remove: ", e.userFollowerId);
            }
        }

        res.status(200).send({
            message: "Bugs fixed"
        });
    } catch (error) {
        res.status(500).send(error.message);
    }
};


function follow(session, res, feed, data, index, accountId, amountFollowed, amountFollow) {
    //Se já seguiu a qtde solicitada para a execução
    if (amountFollowed >= amountFollow) {
        console.log("End request.");
        res.status(200).send({ message: "End request." });
        return;
    }

    //Se não tiver mais dados suficientes, busca mais
    if (index >= data.length) {
        try {

            console.log("Find data");

            if (!feed.isMoreAvailable()) {
                console.log("No more data");
                res.status(200).send({ message: "No more data" });
                return;
            }

            feed.get().then(newData => {
                console.log("New data loaded");
                console.log("");

                data = newData;
                index = 0;
                follow(session, res, feed, data, index, accountId, amountFollowed, amountFollow);
            }, (err) => {
                console.error(err);
                res.status(500).send(err);
            });

        } catch (error) {
            console.error(error);
            res.status(500).send(error);
        }

        return;
    }

    const e = data[index];

    //Se ja segue pula pro proximo
    if (e.account.params.friendshipStatus.following) {
        console.log("*** ", e.account.params.fullName || e.account.params.username, " ***");
        console.log("");
        index++;
        follow(session, res, feed, data, index, accountId, amountFollowed, amountFollow);
        return;
    }

    followProvider.followedOnce(accountId, e.account.id).then(following => {
        //Se ja seguiu algum dia pula pro proximo.
        if (following) {
            //Se não segue no instagram mas no banco segue é um bug.
            if (following.following) {
                console.log("BUG: ", e.account.params.fullName || e.account.params.username, " (", e.account.id, ")");
                console.log("");
            }

            index++;
            follow(session, res, feed, data, index, accountId, amountFollowed, amountFollow);
            return;
        }

        console.log("*** ", e.account.params.fullName || e.account.params.username, " ***");

        genderService.isFemale(e.account.params.fullName || e.account.params.username).then((isFemale) => {
            if (!isFemale) {
                index++;
                follow(session, res, feed, data, index, accountId, amountFollowed, amountFollow);
                return;
            }

            //Segue no instagram
            Client.Relationship.create(session, e.account.id).then((rel) => {
                console.log("Following.");

                //Marca no banco que seguiu
                followProvider.createUser(accountId, e.account.id).then(() => {
                    console.log("Updated database.");

                    //Marca a qntde ja seguida
                    amountFollowed++;

                    //Curte a foto
                    Client.Like.create(session, e.id).then((like) => {
                        console.log("Liked photo.");
                        console.log("");

                        index++;
                        follow(session, res, feed, data, index, accountId, amountFollowed, amountFollow);
                    }, (err) => {
                        console.error(err);

                        if (err instanceof exceptions.RequestsLimitError) {
                            res.status(500).send({ message: err.message });
                            return;
                        }

                        index++;
                        follow(session, res, feed, data, index, accountId, amountFollowed, amountFollow);
                    });
                }, (err) => {
                    console.error(err);

                    if (err instanceof exceptions.RequestsLimitError) {
                        res.status(500).send({ message: err.message });
                        return;
                    }

                    index++;
                    follow(session, res, feed, data, index, accountId, amountFollowed, amountFollow);
                });
            }, (err) => {
                console.error(err);

                if (err instanceof exceptions.RequestsLimitError) {
                    res.status(500).send({ message: err.message });
                    return;
                }

                index++;
                follow(session, res, feed, data, index, accountId, amountFollowed, amountFollow);
            });
        })
            .catch(err => {
                console.error(err);

                if (err instanceof exceptions.RequestsLimitError) {
                    res.status(500).send({ message: err.message });
                    return;
                }

                index++;
                follow(session, res, feed, data, index, accountId, amountFollowed, amountFollow);
            });
    }, (err) => {
        console.error(err);

        if (err instanceof exceptions.RequestsLimitError) {
            res.status(500).send({ message: err.message });
            return;
        }

        index++;
        follow(session, res, feed, data, index, accountId, amountFollowed, amountFollow);
    });
}

exports.unfollow = async (req, res, next) => {
    try {
        const session = req.session;
        const accountId = await session.getAccountId();
        const follows = await followProvider.getFollowing(accountId);

        const dateToUnfollow = req.params.dateToUnfollow;
        const following = req.params.following;

        let index = 0;

        unfollow()

        for (let i = 0; i < follows.length; i++) {
            const e = follows[i];
            
            

            

            // if (!rel.params.following) {
            //     await followProvider.delete(accountId, e.userFollowerId);
            //     console.log("Remove: ", e.userFollowerId);
            // }
        }

        
    } catch (error) {
        res.status(500).send(error.message);
    }
};

function unfollow(follows, index) {

    if (index >= follows.length) {
        res.status(200).send({ message: "End request." });
        return;
    }

    const e = follows[index];

    Client.Relationship.get(session, e.userFollowerId).then((rel) => {

        if (following && rel.params.followed_by) {
            console.log('Ainda não segue de volta');
            index++;
            unfollow(follows, index);
        }

        Client.Account.getById(session, e.userFollowerId).then((friend) => {

            console.log("");
            console.log(friend.params.fullName);
            console.log(rel.params);

            res.status(200).send({ message: "End request." });


        }, (err) => {
            console.error(err);
            res.status(500).send(err);
        });

    }, (err) => {
        console.error(err);
        res.status(500).send(err);
    });

}